// Mirrors crates/pv-core/src/template.rs so the UI can preview instantly.
// The Rust side stays the source of truth for what is saved.

const VAR_SOURCE = String.raw`\{\{\s*([\p{L}\p{N}_]+)\s*\}\}`;

export function extractVariables(body: string): string[] {
  const re = new RegExp(VAR_SOURCE, "gu");
  const seen: string[] = [];
  for (const m of body.matchAll(re)) {
    if (!seen.includes(m[1])) seen.push(m[1]);
  }
  return seen;
}

export function renderTemplate(
  body: string,
  values: Record<string, string>,
): { text: string; unfilled: string[] } {
  const unfilled: string[] = [];
  const text = body.replace(new RegExp(VAR_SOURCE, "gu"), (whole, name: string) => {
    const v = values[name];
    if (v && v.trim() !== "") return v;
    if (!unfilled.includes(name)) unfilled.push(name);
    return whole;
  });
  return { text, unfilled };
}

/** Splits text into plain and `{{VAR}}` parts so the UI can highlight placeholders. */
export function splitPlaceholders(text: string): { text: string; isVar: boolean }[] {
  const parts = text.split(new RegExp(String.raw`(\{\{\s*[\p{L}\p{N}_]+\s*\}\})`, "u"));
  return parts
    .map((p, i) => ({ text: p, isVar: i % 2 === 1 }))
    .filter((p) => p.text !== "");
}

/** Same rules as slugify_file_name in Rust, used only for the live file-name preview. */
export function slugifyFileName(input: string): string {
  const lower = input.trim().toLowerCase();
  const stem = lower.endsWith(".md") ? lower.slice(0, -3) : lower;
  let slug = "";
  let lastDash = true;
  for (const ch of stem) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      slug += ch;
      lastDash = false;
    } else if (!lastDash) {
      slug += "-";
      lastDash = true;
    }
  }
  return Array.from(slug.replace(/^-+|-+$/g, ""))
    .slice(0, 80)
    .join("")
    .replace(/^-+|-+$/g, "");
}

/** "POSTS_PER_WEEK" -> "Posts per week" (fallback when a variable has no label). */
export function humanizeVariable(name: string): string {
  const s = name.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Values worth remembering for next time: short, single-line answers only. */
export function rememberable(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v.trim() !== "" && v.length <= 200 && !v.includes("\n")) out[k] = v;
  }
  return out;
}
