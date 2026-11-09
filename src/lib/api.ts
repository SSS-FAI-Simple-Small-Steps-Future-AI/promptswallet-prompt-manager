import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ABOUT } from "./about";
import { getNvidiaKey } from "./settings";
import type {
  AdResponse,
  PackReport,
  PromptDetail,
  PromptUpdate,
  SearchHit,
  Tree,
  UserState,
} from "../types";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Calls a Rust command. In a plain browser (`npm run dev` without Tauri) the in-memory
 * stand-in from mock.ts answers instead; that branch is removed from production builds.
 */
async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (inTauri) return invoke<T>(cmd, args);
  if (import.meta.env.DEV) {
    const { mockInvoke } = await import("./mock");
    return (await mockInvoke(cmd, args)) as T;
  }
  throw new Error("PromptsWallet needs to run inside the desktop app.");
}

/** Typed wrappers around the Rust commands in src-tauri/src/lib.rs. Errors arrive as strings. */
export const api = {
  getTree: () => call<Tree>("get_tree"),
  getPrompt: (id: string) => call<PromptDetail>("get_prompt", { id }),
  searchPrompts: (query: string) => call<SearchHit[]>("search_prompts", { query }),
  createCategory: (name: string) => call<string>("create_category", { name }),
  deleteCategory: (name: string) => call<void>("delete_category", { name }),
  createEmptyPrompt: (category: string, fileName: string) =>
    call<PromptDetail>("create_empty_prompt", { category, fileName }),
  createFromTemplate: (sourceId: string, name: string, category: string) =>
    call<PromptDetail>("create_from_template", { sourceId, name, category }),
  savePrompt: (id: string, update: PromptUpdate) =>
    call<PromptDetail>("save_prompt", { id, update }),
  revertToOriginal: (id: string) => call<PromptDetail>("revert_to_original", { id }),
  deletePrompt: (id: string) => call<void>("delete_prompt", { id }),
  getUserState: () => call<UserState>("get_user_state"),
  toggleFavorite: (id: string) => call<boolean>("toggle_favorite", { id }),
  recordUse: (id: string, values: Record<string, string>) =>
    call<UserState>("record_use", { id, values }),
  /** Reads a pack (.zip) and lists what it holds or what is wrong. Writes nothing. */
  inspectPack: (path: string) => call<PackReport>("inspect_pack", { path }),
  /** Why a pack name can't be used (`null` = fine). `packId` lets an update keep its own name. */
  packNameProblem: (name: string, packId: string) =>
    call<string | null>("pack_name_problem", { name, packId }),
  /**
   * Imports a pack under `name`. `confirmUpdate` is required when an older version of the same
   * pack (same id) is installed; the old copy is then removed.
   */
  importPack: (path: string, name: string, confirmUpdate = false) =>
    call<PackReport>("import_pack", { path, name, confirmUpdate }),
  /** `folder` is the pack's folder name (PackNode.folder). */
  removePack: (folder: string) => call<void>("remove_pack", { name: folder }),
  /**
   * "Rewrite with AI": asks the NVIDIA API (with the chosen NVIDIA `model`) to rewrite `text` for
   * `targetLlm`, knowing what the prompt is for (`context`). Returns the new text.
   */
  rewritePrompt: (text: string, context: string, targetLlm: string, model: string) =>
    call<string>("rewrite_prompt", {
      url: ABOUT.nvidiaApiUrl,
      model,
      apiKey: getNvidiaKey() || null,
      text,
      context,
      targetLlm,
    }),
  /** One advertisement from an ad service (one of ABOUT.ads.*.apiUrl). */
  fetchAd: (url: string) => call<AdResponse>("fetch_ad", { url }),
  workspacePath: () => call<string>("workspace_path"),
  revealWorkspace: () => call<void>("reveal_workspace"),
};

/** Opens the system file picker for a prompt pack. Resolves to the file path, or null if cancelled. */
export async function pickPackFile(): Promise<string | null> {
  if (inTauri) {
    const picked = await openFileDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Prompts pack (.zip)", extensions: ["zip"] }],
    });
    return typeof picked === "string" ? picked : null;
  }
  if (import.meta.env.DEV) {
    const { pickMockPackFile } = await import("./mock");
    return pickMockPackFile();
  }
  throw new Error("PromptsWallet needs to run inside the desktop app.");
}

export async function copyText(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
