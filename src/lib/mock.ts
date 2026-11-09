// Browser-only stand-in for the Rust commands, used by `npm run dev` when the page is opened
// in a normal browser (no Tauri). It loads the real packs from /library, keeps everything in
// memory and applies the same rules (read-only built-ins, names, copies), so the UI can be
// developed and tested without compiling the desktop shell. It is dropped from production builds.

import type {
  CategoryNode,
  PackCategory,
  PackNode,
  PackReport,
  PromptDetail,
  PromptSummary,
  PromptUpdate,
  Scope,
  SearchHit,
  Tree,
  UserState,
  VariableDef,
} from "../types";
import { extractVariables, slugifyFileName } from "./template";

const files = import.meta.glob("../../library/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const categoryFiles = import.meta.glob("../../library/**/_category.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const packConfigs = import.meta.glob("../../library/*/config.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

interface Meta {
  id?: string;
  title?: string;
  description?: string;
  tags: string[];
  variables: VariableDef[];
  derivedFrom?: string;
  updated?: string;
}

interface MEntry {
  id: string;
  scope: Scope;
  category: string;
  fileName: string;
  meta: Meta;
  body: string;
  /** Folder name of the prompts pack (read-only prompts only). */
  pack?: string;
}

const READ_ONLY_MSG =
  'Built-in prompts are read-only. Use "Use as template" to make an editable copy.';

function unquote(v: string): string {
  const t = v.trim();
  if (t.startsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      /* fall through */
    }
  }
  return t;
}

/** Reads the small, regular front matter that the generator and the app write. */
function parseFile(raw: string): { meta: Meta; body: string } {
  const text = raw.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?\n?([\s\S]*)$/.exec(text);
  const meta: Meta = { tags: [], variables: [] };
  if (!m) return { meta, body: text };

  let inVars = false;
  let cur: VariableDef | null = null;
  for (const line of m[1].split("\n")) {
    if (inVars && /^\s+- name:/.test(line)) {
      cur = { name: unquote(line.replace(/^\s+- name:/, "")) };
      meta.variables.push(cur);
      continue;
    }
    if (inVars && cur && /^\s{4}\w+:/.test(line)) {
      const idx = line.indexOf(":");
      const key = line.slice(0, idx).trim();
      const val = unquote(line.slice(idx + 1));
      if (key === "label") cur.label = val;
      else if (key === "placeholder") cur.placeholder = val;
      else if (key === "default") cur.default = val;
      continue;
    }
    inVars = false;
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === "variables") inVars = true;
    else if (key === "id") meta.id = unquote(value);
    else if (key === "title") meta.title = unquote(value);
    else if (key === "description") meta.description = unquote(value);
    else if (key === "derived_from") meta.derivedFrom = unquote(value);
    else if (key === "updated") meta.updated = unquote(value);
    else if (key === "tags")
      meta.tags = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
  }
  return { meta, body: m[2] };
}

const today = () => new Date().toISOString().slice(0, 10);
let counter = 0;
const newId = () => `mock-${Date.now().toString(36)}-${counter++}`;

// <library>/<pack folder>/categories/<Category>/<file>.md  (README.md next to config.json is not a prompt)
const builtin: MEntry[] = Object.entries(files)
  .filter(([path]) => path.split("/").slice(-3, -2)[0] === "categories")
  .map(([path, raw]) => {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
    const category = parts[parts.length - 2];
    const pack = parts[parts.length - 4];
    const { meta, body } = parseFile(raw);
    return {
      id: meta.id ?? `${pack}/${category}/${fileName}`,
      scope: "builtin" as Scope,
      pack,
      category,
      fileName,
      meta,
      body,
    };
  })
  .filter((e) => !e.fileName.startsWith("_"))
  .sort((a, b) => a.fileName.localeCompare(b.fileName));

const builtinCategories = Object.entries(categoryFiles)
  .map(([path, raw]) => {
    const parts = path.split("/");
    return {
      pack: parts[parts.length - 4],
      name: parts[parts.length - 2],
      description: /^description:\s*(.*)$/m.exec(raw)?.[1]?.trim() ?? "",
      order: Number(/^order:\s*(\d+)/m.exec(raw)?.[1] ?? 999),
    };
  })
  .sort((a, b) => a.order - b.order);

let mine: MEntry[] = [];
let mineCategories: string[] = ["Uncategorized"];
interface MPack {
  /** Name shown in the app. */
  name: string;
  /** Folder name; the key used for `Nav` and on entries. */
  folder: string;
  packId: string;
  version: string;
  builtin: boolean;
  categories: { name: string; description: string }[];
}
const builtinPacks: MPack[] = Object.entries(packConfigs).map(([path, raw]) => {
  const folder = path.split("/").slice(-2)[0];
  let cfg: Record<string, string> = {};
  try {
    cfg = JSON.parse(raw) as Record<string, string>;
  } catch {
    /* keep the folder name */
  }
  return {
    name: cfg["title"] ?? folder,
    folder,
    packId: cfg["prompt-pack-id"] ?? folder,
    version: cfg["version"] ?? "",
    builtin: true,
    categories: builtinCategories.filter((c) => c.pack === folder).map((c) => ({ name: c.name, description: c.description })),
  };
});
let importedPacks: MPack[] = [];
let importedEntries: MEntry[] = [];
let userState: UserState = { favorites: [], recents: [], lastValues: {} };

const all = () => [...builtin, ...importedEntries, ...mine];
const title = (e: MEntry) => e.meta.title || e.fileName.replace(/\.(md|txt)$/i, "").replace(/[-_]/g, " ");

function summary(e: MEntry): PromptSummary {
  return {
    id: e.id,
    title: title(e),
    description: e.meta.description ?? "",
    tags: e.meta.tags,
    category: e.category,
    pack: e.pack ?? null,
    scope: e.scope,
    readOnly: e.scope === "builtin",
    derivedFrom: e.meta.derivedFrom ?? null,
    fileName: e.fileName,
    variableCount: extractVariables(e.body).length,
    updated: e.meta.updated ?? null,
    warning: null,
  };
}

function mergeVars(declared: VariableDef[], body: string): VariableDef[] {
  return extractVariables(body).map((name) => declared.find((d) => d.name === name) ?? { name });
}

function detail(e: MEntry): PromptDetail {
  const origin = e.meta.derivedFrom ? all().find((x) => x.id === e.meta.derivedFrom) : undefined;
  return {
    ...summary(e),
    body: e.body,
    variables: mergeVars(e.meta.variables, e.body),
    targetModels: [],
    derivedFromTitle: origin ? title(origin) : null,
  };
}

function find(id: string): MEntry {
  const e = all().find((x) => x.id === id);
  if (!e) throw `Prompt not found: ${id}`;
  return e;
}

function folderName(name: string): string {
  const n = name.replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "");
  if (!n) throw "Please enter a category name.";
  return n;
}

function addUser(category: string, name: string, meta: Meta, body: string): MEntry {
  const cat = folderName(category);
  const slug = slugifyFileName(name);
  if (!slug) throw "Please enter a file name (letters or numbers).";
  const fileName = `${slug}.md`;
  if (mine.some((e) => e.category === cat && e.fileName === fileName)) {
    throw `A file named "${fileName}" already exists there.`;
  }
  if (!mineCategories.includes(cat)) mineCategories.push(cat);
  const entry: MEntry = { id: newId(), scope: "user", category: cat, fileName, meta, body };
  mine.push(entry);
  return entry;
}

const cleanTitle = (name: string) => name.trim().replace(/\.md$/i, "").trim();

function tree(): Tree {
  const nodeFor = (name: string, scope: Scope, description: string, pack?: string): CategoryNode => ({
    name,
    description,
    icon: null,
    scope,
    readOnly: scope === "builtin",
    pack: pack ?? null,
    prompts: all()
      .filter((e) => e.scope === scope && e.category === name && (e.pack ?? null) === (pack ?? null))
      .map(summary),
  });
  const packNode = (p: MPack): PackNode => ({
    name: p.name,
    folder: p.folder,
    packId: p.packId,
    version: p.version,
    builtin: p.builtin,
    categories: p.categories.map((c) => nodeFor(c.name, "builtin", c.description, p.folder)),
  });
  return {
    packs: [...builtinPacks, ...[...importedPacks].sort((a, b) => a.name.localeCompare(b.name))].map(packNode),
    mine: [...mineCategories]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => nodeFor(c, "user", "")),
  };
}

function search(query: string): SearchHit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const e of all()) {
    const t = title(e).toLowerCase();
    const d = (e.meta.description ?? "").toLowerCase();
    const tags = e.meta.tags.join(" ").toLowerCase();
    const b = e.body.toLowerCase();
    let score = 0;
    let ok = true;
    for (const tok of tokens) {
      const s = (t.includes(tok) ? 10 : 0) + (tags.includes(tok) ? 5 : 0) + (d.includes(tok) ? 3 : 0) + (b.includes(tok) ? 1 : 0);
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) hits.push({ prompt: summary(e), score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 50);
}

// ---------- prompt packs (browser preview only) ----------
// Reads the real structure and text of a picked .zip, so the import dialog can be tried with
// real archives in a browser. The desktop app does all of this in Rust (crates/pv-core/src/pack.rs).

const pickedFiles = new Map<string, File>();

/** Browser stand-in for the native file picker. */
export function pickMockPackFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.style.display = "none";
    document.body.appendChild(input);
    const done = (value: string | null) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (!f) return done(null);
      pickedFiles.set(f.name, f);
      done(f.name);
    });
    input.addEventListener("cancel", () => done(null));
    input.click();
  });
}

interface ZipItem {
  name: string;
  method: number;
  csize: number;
  offset: number;
}

function readZipDirectory(buf: ArrayBuffer): ZipItem[] | null {
  const v = new DataView(buf);
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const items: ZipItem[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.byteLength || v.getUint32(p, true) !== 0x02014b50) return null;
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    items.push({
      name: new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen)),
      method: v.getUint16(p + 10, true),
      csize: v.getUint32(p + 20, true),
      offset: v.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return items;
}

async function readZipText(buf: ArrayBuffer, it: ZipItem): Promise<string> {
  const v = new DataView(buf);
  const start = it.offset + 30 + v.getUint16(it.offset + 26, true) + v.getUint16(it.offset + 28, true);
  const data = new Uint8Array(buf, start, it.csize);
  if (it.method === 0) return new TextDecoder().decode(data);
  if (it.method === 8) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  }
  throw "This zip uses a compression method the preview cannot read.";
}

interface PackPlan {
  report: PackReport;
  configText: string;
  readmeText: string;
  staged: { category: string; fileName: string; text: string }[];
}

const INVALID = "Invalid prompts pack";
const PACK_PREFIX = "promptswallet-pack-";
const CONFIG_SHAPE = '{"prompt-pack-id": "<26-character ULID>", "title": "<name>", "version": "1.0"}';
const MAX_PACK_NAME = 80;

const eqi = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hasControl = (t: string) => /[\u0000-\u001f\u007f]/.test(t);

function fileNameProblem(name: string): string | null {
  if (/[<>:"|?*]/.test(name)) return 'contains a character that is not allowed in file names (< > : " | ? *)';
  if (name.startsWith(".") || name.startsWith("_")) return 'starts with "." or "_", which the app reserves';
  if (name.endsWith(".") || name.endsWith(" ")) return "ends with a dot or a space";
  if (name.length > 150) return "has a name longer than 150 characters";
  return null;
}

/** Mirrors crates/pv-core/src/pack.rs: config.json + categories/<Category>/<file>.md + README.md. */
async function planPack(path: string): Promise<PackPlan> {
  const file = pickedFiles.get(path);
  if (!file) throw "Could not open the file: not found";
  const errors: string[] = [];
  const invalid = (detail: string) => errors.push(`${INVALID}: ${detail}`);
  let ignored = 0;
  const base = (): PackReport => ({
    fileName: file.name,
    packId: "",
    packFolder: "",
    title: "",
    version: "",
    categories: [],
    promptCount: 0,
    ignoredFiles: ignored,
    existing: null,
    errors,
  });
  const empty = (): PackPlan => ({ report: base(), configText: "", readmeText: "", staged: [] });

  const buf = await file.arrayBuffer();
  const dir = readZipDirectory(buf);
  if (!dir) {
    errors.push("This is not a valid .zip file. Choose a .zip archive.");
    return empty();
  }

  const items: { segs: string[]; item: ZipItem }[] = [];
  for (const it of dir) {
    const segs = it.name.replace(/\\/g, "/").split("/").filter((x) => x && x !== ".");
    if (it.name.startsWith("/") || segs.includes("..")) {
      errors.push(`Unsafe path in the zip: "${it.name}".`);
      continue;
    }
    if (segs.includes("__MACOSX")) {
      ignored++;
      continue;
    }
    if (it.name.endsWith("/")) continue;
    const last = segs[segs.length - 1];
    if (/^(\.ds_store|thumbs\.db|desktop\.ini)$/i.test(last) || last.startsWith("._")) {
      ignored++;
      continue;
    }
    items.push({ segs, item: it });
  }

  const isKnown = (x: string) => eqi(x, "config.json") || eqi(x, "readme.md") || eqi(x, "categories");
  const tops = new Set(items.map((i) => i.segs[0]));
  const skip = tops.size === 1 && [...tops].every((t) => !isKnown(t)) && items.every((i) => i.segs.length >= 2) ? 1 : 0;

  const configItem = items.find((i) => i.segs.length === skip + 1 && eqi(i.segs[skip], "config.json"));
  const readmeItem = items.find((i) => i.segs.length === skip + 1 && eqi(i.segs[skip], "readme.md"));
  const hasCategories = items.some((i) => i.segs.length > skip + 1 && eqi(i.segs[skip], "categories"));
  let structural = false;
  if (!configItem) (invalid('"config.json" is missing.'), (structural = true));
  if (!hasCategories) (invalid('the "categories" folder is missing or has no files in it.'), (structural = true));
  if (!readmeItem) (invalid('"README.md" is missing.'), (structural = true));
  if (structural || !configItem || !readmeItem) return empty();

  // config.json: exactly the three text fields
  let configText = "";
  let cfg: { id: string; title: string; version: string } | null = null;
  try {
    configText = (await readZipText(buf, configItem.item)).replace(/^\uFEFF/, "");
    const value: unknown = JSON.parse(configText);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      invalid(`config.json must be a JSON object like ${CONFIG_SHAPE}.`);
    } else {
      const obj = value as Record<string, unknown>;
      const before = errors.length;
      const field = (key: string): string | null => {
        const v = obj[key];
        if (v === undefined) return (invalid(`config.json has no "${key}" field.`), null);
        if (typeof v === "string" && v.trim()) return v.trim();
        return (invalid(`"${key}" in config.json must be a non-empty text value.`), null);
      };
      const id = field("prompt-pack-id");
      const title = field("title");
      const version = field("version");
      for (const k of Object.keys(obj))
        if (!["prompt-pack-id", "title", "version"].includes(k))
          invalid(`config.json has an unexpected field "${k}". Only "prompt-pack-id", "title" and "version" are allowed.`);
      if (id && title && version) {
        if (id.length !== 26 || !/^[A-Za-z0-9]+$/.test(id))
          invalid('"prompt-pack-id" must be a 26-character ULID (letters and digits), for example "01M6TCPTTZE1S19QFHPYF0T097".');
        if ([...title].length > 100 || hasControl(title)) invalid('"title" must be plain text of at most 100 characters.');
        if ([...version].length > 32 || hasControl(version))
          invalid('"version" must be plain text of at most 32 characters, for example "1.0".');
        if (errors.length === before) cfg = { id, title, version };
      }
    }
  } catch (e) {
    invalid(`config.json is not valid JSON (${e instanceof Error ? e.message : String(e)}). It must look like ${CONFIG_SHAPE}.`);
  }
  const readmeText = (await readZipText(buf, readmeItem.item)).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!readmeText.trim()) invalid("README.md is empty.");

  // prompts
  const folders = new Map<string, { name: string; files: { fileName: string; text: string }[] }>();
  const seen = new Set<string>();
  const clash = new Set<string>();
  for (const { segs, item } of items) {
    const rel = segs.slice(skip);
    if (rel.length === 0) continue;
    if (rel.length === 1 && (eqi(rel[0], "config.json") || eqi(rel[0], "readme.md"))) continue;
    if (!eqi(rel[0], "categories")) {
      ignored++;
      continue;
    }
    const shown = segs.join("/");
    const inner = rel.slice(1);
    if (inner.length === 1) {
      errors.push(`"${shown}": is directly inside "${rel[0]}". Put prompt files inside a category folder.`);
      continue;
    }
    if (inner.length > 2) {
      errors.push(`"${shown}": is inside a nested folder. A category folder can only contain prompt files, not more folders.`);
      continue;
    }
    const [folder, name] = inner;
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
    if (!ext) {
      errors.push(`"${shown}": has no file extension. Only .md prompt files can be imported.`);
      continue;
    }
    if (ext !== "md") {
      errors.push(`"${shown}": .${ext} files are not allowed. Only .md prompt files can be imported.`);
      continue;
    }
    const problem = fileNameProblem(name);
    if (problem) {
      errors.push(`"${shown}": ${problem}.`);
      continue;
    }
    const text = (await readZipText(buf, item)).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    if (!text.trim()) {
      errors.push(`"${shown}": is empty.`);
      continue;
    }
    const key = folder.toLowerCase();
    const slot = folders.get(key) ?? { name: folder, files: [] };
    folders.set(key, slot);
    if (slot.name !== folder) {
      if (!clash.has(key)) {
        clash.add(key);
        errors.push(`The folders "${slot.name}" and "${folder}" would have the same name on case-insensitive systems.`);
      }
      continue;
    }
    if (seen.has(`${key}/${name.toLowerCase()}`)) {
      errors.push(`"${shown}": appears twice (file names are compared ignoring upper/lower case).`);
      continue;
    }
    seen.add(`${key}/${name.toLowerCase()}`);
    slot.files.push({ fileName: name, text });
  }

  const categories: PackCategory[] = [];
  const staged: PackPlan["staged"] = [];
  for (const f of [...folders.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([, v]) => v)) {
    categories.push({ name: f.name, promptCount: f.files.length });
    for (const x of f.files) staged.push({ category: f.name, ...x });
  }
  if (errors.length === 0 && staged.length === 0) errors.push("No prompt files (.md) were found in the pack.");

  // is the id already installed?
  const packId = cfg?.id ?? "";
  const version = cfg?.version ?? "";
  let existing: PackReport["existing"] = null;
  if (packId) {
    const found = [...builtinPacks, ...importedPacks].find((p) => eqi(p.packId, packId));
    if (found?.builtin) errors.push(`A pack with the id "${packId}" ships with the app and cannot be replaced.`);
    else if (found) existing = { name: found.name, version: found.version, sameVersion: found.version.trim() === version.trim() };
  }

  const ok = errors.length === 0;
  return {
    report: {
      ...base(),
      packId,
      packFolder: packId ? `${PACK_PREFIX}${packId}` : "",
      title: cfg?.title ?? "",
      version,
      categories: ok ? categories : [],
      promptCount: ok ? staged.length : 0,
      existing: ok ? existing : null,
    },
    configText,
    readmeText,
    staged: ok ? staged : [],
  };
}

function packNameProblem(name: string, packId: string): string | null {
  const n = name.trim();
  if (!n) return "Enter a name for the prompts pack.";
  if ([...n].length > MAX_PACK_NAME || hasControl(n)) return `The name must be plain text of at most ${MAX_PACK_NAME} characters.`;
  const taken = [...builtinPacks, ...importedPacks].some((p) => !eqi(p.packId, packId) && p.name.trim().toLowerCase() === n.toLowerCase());
  return taken ? `A prompts pack named "${n}" already exists. Choose another name.` : null;
}

// ---------- ads and "Rewrite with AI" (browser preview only) ----------
// The desktop app asks real web services (src-tauri/src/net.rs); here two fakes answer, so the
// banner refresh and the rewrite button can be tried in a browser.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bannerSvg(text: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><text x="80" y="104" text-anchor="middle" font-family="Georgia,serif" font-size="84" fill="#fff">${text.charAt(0)}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const MOCK_ADS = [
  { id: "AD-10001", advertiser: "TechVendor Inc.", title: "Explore the Latest AI Solutions", text: "Explore the Latest AI Solutions", url: "https://techvendor.com/ai-solutions", from: "#c15f3c", to: "#8a3f24" },
  { id: "AD-10002", advertiser: "CloudNine Ltd.", title: "Ship faster on CloudNine", text: "Ship faster on CloudNine", url: "https://cloudnine.example/deploy", from: "#2f5d50", to: "#1c3a31" },
  { id: "AD-10004", advertiser: "NeuralWorks", title: "Fine-tune models without the GPU bill", text: "Neural", url: "https://neuralworks.example/tune", from: "#7a3b6a", to: "#52233f" },
  { id: "AD-10003", advertiser: "DataForge", title: "Vector search in minutes", text: "Vector search in minutes", url: "https://dataforge.example/vectors", from: "#3b4a7a", to: "#232d52" },
];

declare global {
  interface Window {
    /** Test hooks of the browser preview. */
    __adCalls?: number;
    /** Every address the ad banners asked for. */
    __adUrls?: string[];
    __mockAdFail?: boolean;
  }
}

async function mockFetchAd(url: unknown): Promise<unknown> {
  (window.__adUrls = window.__adUrls ?? []).push(String(url));
  const n = (window.__adCalls = (window.__adCalls ?? 0) + 1);
  await sleep(150);
  if (window.__mockAdFail) throw "Could not reach the ad server. Check your internet connection and try again.";
  const ad = MOCK_ADS[(n - 1) % MOCK_ADS.length];
  return {
    success: true,
    message: "Advertisement fetched successfully",
    data: {
      ad_id: ad.id,
      advertiser: ad.advertiser,
      campaign_id: "CMP-2026-001",
      title: ad.title,
      description: "Discover innovative tools and services for your business.",
      banner: {
        image_url: `https://cdn.example.com/ads/${ad.id}-728x90.png`,
        image_data_url: bannerSvg(ad.text, ad.from, ad.to),
        width: 160,
        height: 160,
        alt_text: `${ad.title} advertisement`,
      },
      target_url: ad.url,
      click_action: "external_browser",
      status: "active",
    },
    refresh_interval: 60,
    timestamp: new Date().toISOString(),
  };
}

declare global {
  interface Window {
    /** Test hook: the last arguments "Rewrite with AI" was called with. */
    __rewriteCalls?: Record<string, unknown>[];
    /** Test hook: milliseconds the mock rewrite takes (default 400). */
    __mockRewriteMs?: number;
  }
}

async function mockRewrite(a: Args): Promise<string> {
  const text = String(a.text ?? "");
  (window.__rewriteCalls ??= []).push({ ...a, apiKey: a.apiKey ? "(set)" : null });
  await sleep(window.__mockRewriteMs ?? 400);
  if (!a.apiKey) throw "No NVIDIA API key yet. Add it in Settings > AI rewrite.";
  if (!text.trim()) throw "There is no text to rewrite.";
  if (!String(a.targetLlm ?? "").trim()) throw "Choose which LLM to optimize for.";
  if (!String(a.context ?? "").trim()) throw "Describe what this prompt is for first. The AI needs it to rewrite the prompt well.";
  if (!["nvidia/nemotron-3.5-bolt-e4b", "mistralai/mistral-large-4-1t-a52b", "deepseek-ai/deepseek-v4.1-flash", "nvidia/nemotron-3.5-lightning-30b-a3b", "openai/gpt-oss-20b"].includes(String(a.model ?? ""))) throw "Choose a model from the list.";
  // "[[fail-bolt]]" makes only the default model fail, so a test can switch to another model.
  if (text.includes("[[fail-bolt]]") && a.model === "nvidia/nemotron-3.5-bolt-e4b") throw "NVIDIA does not offer this model right now. Choose a different model in the list and try again.";
  if (text.includes("[[fail]]")) throw "NVIDIA says too many requests were made. Wait a minute and try again.";
  if (text.includes("[[badkey]]")) throw "NVIDIA did not accept the API key. Check it in Settings > AI rewrite (it starts with nvapi-).";
  const goal = String(a.context ?? "").trim();
  return `[${a.targetLlm}] ${text.trim().replace(/\s+/g, " ")}${goal ? `\n\nGoal: ${goal}` : ""}`;
}

type Args = Record<string, unknown>;

export async function mockInvoke(cmd: string, a: Args): Promise<unknown> {
  switch (cmd) {
    case "get_tree":
      return tree();
    case "get_prompt":
      return detail(find(a.id as string));
    case "search_prompts":
      return search(a.query as string);
    case "create_category": {
      const name = folderName(a.name as string);
      if (mineCategories.includes(name)) throw `A file named "${name}" already exists there.`;
      mineCategories.push(name);
      return name;
    }
    case "delete_category": {
      const name = a.name as string;
      if (!mineCategories.includes(name)) throw `Prompt not found: ${name}`;
      mineCategories = mineCategories.filter((c) => c !== name);
      mine = mine.filter((e) => e.category !== name);
      return null;
    }
    case "create_empty_prompt": {
      const name = a.fileName as string;
      const e = addUser(a.category as string, name, { title: cleanTitle(name), tags: [], variables: [], updated: today() }, "");
      return detail(e);
    }
    case "create_from_template": {
      const src = find(a.sourceId as string);
      const name = a.name as string;
      const e = addUser(
        a.category as string,
        name,
        {
          title: cleanTitle(name),
          description: src.meta.description,
          tags: [...src.meta.tags],
          variables: src.meta.variables.map((v) => ({ ...v })),
          derivedFrom: src.id,
          updated: today(),
        },
        src.body,
      );
      return detail(e);
    }
    case "save_prompt": {
      const e = find(a.id as string);
      if (e.scope === "builtin") throw READ_ONLY_MSG;
      const u = a.update as PromptUpdate;
      e.body = u.body.replace(/\r\n/g, "\n");
      e.meta = {
        ...e.meta,
        title: u.title.trim() || title(e),
        description: u.description.trim() || undefined,
        tags: u.tags.map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
        variables: u.variables.filter((v) => v.label || v.placeholder || v.default),
        updated: today(),
      };
      return detail(e);
    }
    case "revert_to_original": {
      const e = find(a.id as string);
      if (e.scope === "builtin") throw READ_ONLY_MSG;
      const origin = e.meta.derivedFrom ? all().find((x) => x.id === e.meta.derivedFrom) : undefined;
      if (!origin) throw "Prompt not found: original prompt";
      e.body = origin.body;
      e.meta.variables = origin.meta.variables.map((v) => ({ ...v }));
      e.meta.updated = today();
      return detail(e);
    }
    case "delete_prompt": {
      const e = find(a.id as string);
      if (e.scope === "builtin") throw READ_ONLY_MSG;
      mine = mine.filter((x) => x.id !== e.id);
      return null;
    }
    case "get_user_state":
      return userState;
    case "toggle_favorite": {
      find(a.id as string);
      const id = a.id as string;
      const on = !userState.favorites.includes(id);
      userState = {
        ...userState,
        favorites: on ? [id, ...userState.favorites] : userState.favorites.filter((f) => f !== id),
      };
      return on;
    }
    case "record_use": {
      const id = a.id as string;
      const values = a.values as Record<string, string>;
      const lastValues = { ...userState.lastValues };
      for (const [k, v] of Object.entries(values)) if (v.trim()) lastValues[k] = v;
      userState = {
        ...userState,
        recents: [id, ...userState.recents.filter((r) => r !== id)].slice(0, 20),
        lastValues,
      };
      return userState;
    }
    case "inspect_pack":
      return (await planPack(a.path as string)).report;
    case "pack_name_problem":
      return packNameProblem(a.name as string, a.packId as string);
    case "import_pack": {
      const plan = await planPack(a.path as string);
      const r = plan.report;
      if (r.errors.length > 0) {
        throw `The pack was not imported:\n${r.errors.map((e) => `• ${e}`).join("\n")}`;
      }
      if (r.existing?.sameVersion) {
        throw `This prompts pack is already imported as "${r.existing.name}" (version ${r.existing.version}).`;
      }
      if (r.existing && a.confirmUpdate !== true) {
        throw `"${r.existing.name}" is already imported with version ${r.existing.version}. Confirm to update it to version ${r.version}.`;
      }
      const name = (a.name as string).trim();
      const problem = packNameProblem(name, r.packId);
      if (problem) throw problem;
      const old = importedPacks.filter((p) => eqi(p.packId, r.packId)).map((p) => p.folder);
      importedPacks = importedPacks.filter((p) => !old.includes(p.folder));
      importedEntries = importedEntries.filter((e) => !old.includes(e.pack ?? ""));
      importedPacks.push({
        name,
        folder: r.packFolder,
        packId: r.packId,
        version: r.version,
        builtin: false,
        categories: r.categories.map((c) => ({ name: c.name, description: "" })),
      });
      for (const st of plan.staged) {
        const { meta, body } = parseFile(st.text);
        importedEntries.push({
          id: meta.id ?? `${r.packFolder}/${st.category}/${st.fileName}`,
          scope: "builtin",
          pack: r.packFolder,
          category: st.category,
          fileName: st.fileName,
          meta,
          body,
        });
      }
      return r;
    }
    case "remove_pack": {
      const folder = a.name as string;
      if (!importedPacks.some((p) => p.folder === folder)) throw `Prompt not found: ${folder}`;
      importedPacks = importedPacks.filter((p) => p.folder !== folder);
      importedEntries = importedEntries.filter((e) => e.pack !== folder);
      return null;
    }
    case "rewrite_prompt":
      return mockRewrite(a);
    case "fetch_ad":
      return mockFetchAd(a.url);
    case "workspace_path":
      return "~/Documents/PromptVault (browser preview)";
    case "reveal_workspace":
      return null;
    default:
      throw `Unknown command: ${cmd}`;
  }
}
