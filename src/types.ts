export type Scope = "builtin" | "user";

export interface VariableDef {
  name: string;
  label?: string | null;
  placeholder?: string | null;
  default?: string | null;
}

export interface PromptSummary {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  /** Folder name of the prompts pack it belongs to (null for My Prompts). */
  pack?: string | null;
  scope: Scope;
  readOnly: boolean;
  derivedFrom?: string | null;
  fileName: string;
  variableCount: number;
  updated?: string | null;
  warning?: string | null;
}

export interface PromptDetail extends PromptSummary {
  body: string;
  variables: VariableDef[];
  targetModels: string[];
  derivedFromTitle?: string | null;
}

export interface CategoryNode {
  name: string;
  description: string;
  icon?: string | null;
  scope: Scope;
  readOnly: boolean;
  pack?: string | null;
  prompts: PromptSummary[];
}

/** A prompts pack: pack > categories > prompts. */
export interface PackNode {
  /** The name shown in the app (chosen when the pack was imported). */
  name: string;
  /** Folder name `promptswallet-pack-<ULID>`: the key used in `Nav` and on prompts. */
  folder: string;
  /** `prompt-pack-id` from its config.json. */
  packId: string;
  version: string;
  /** Ships with the app. Imported packs (false) can be removed. */
  builtin: boolean;
  categories: CategoryNode[];
}

export interface PackCategory {
  name: string;
  promptCount: number;
}

/** A pack with the same `prompt-pack-id` that is already installed. */
export interface ExistingPackInfo {
  name: string;
  version: string;
  /** Same version as the zip: nothing to update. */
  sameVersion: boolean;
}

export interface PackReport {
  fileName: string;
  /** `prompt-pack-id` from config.json. */
  packId: string;
  /** Folder name the pack gets in the app. */
  packFolder: string;
  /** `title` from config.json: the suggested name. */
  title: string;
  version: string;
  categories: PackCategory[];
  promptCount: number;
  /** System files (e.g. .DS_Store) and extra files next to config.json that were skipped. */
  ignoredFiles: number;
  existing: ExistingPackInfo | null;
  /** Empty when the pack can be imported. */
  errors: string[];
}

export interface Tree {
  packs: PackNode[];
  mine: CategoryNode[];
}

export interface UserState {
  favorites: string[];
  recents: string[];
  lastValues: Record<string, string>;
}

export interface PromptUpdate {
  title: string;
  description: string;
  tags: string[];
  variables: VariableDef[];
  body: string;
}

export interface SearchHit {
  prompt: PromptSummary;
  score: number;
}

export type Nav =
  | { kind: "favorites" }
  | { kind: "recent" }
  | { kind: "category"; scope: Scope; pack?: string | null; name: string };

/** The advertisement JSON from the ad service (see README, "Ad banner"). */
export interface AdResponse {
  success?: boolean;
  message?: string;
  data?: {
    ad_id: string;
    advertiser?: string;
    campaign_id?: string;
    title?: string;
    description?: string;
    banner?: {
      image_url?: string;
      /** Added by the app: the image itself, so the window never loads anything remote. */
      image_data_url?: string;
      width?: number;
      height?: number;
      alt_text?: string;
    };
    target_url?: string;
    click_action?: string;
    status?: string;
  };
  refresh_interval?: number;
  timestamp?: string;
}
