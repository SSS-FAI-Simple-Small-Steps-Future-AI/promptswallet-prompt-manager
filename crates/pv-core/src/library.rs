//! Scanning the built-in library and the user's prompts into one in-memory index.
//!
//! Layout:
//! * Prompts Packs (shipped with the app, or imported): `<root>/promptswallet-pack-<ULID>/` with
//!   `config.json`, `README.md`, `categories/<Category>/<prompt>.md` and, for imported packs,
//!   `metadata.json` (the name the user gave it, version, import date).
//! * My Prompts: `<workspace>/My Prompts/<Category>/<prompt>.md`.
//!
//! A category folder may have an optional `_category.yaml` with `description`, `icon`, `order`.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::guard::Roots;
use crate::prompt::{self, Meta};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Builtin,
    User,
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub id: String,
    pub scope: Scope,
    /// Folder name of the prompts pack this prompt belongs to (`None` for My Prompts).
    pub pack: Option<String>,
    pub category: String,
    pub path: PathBuf,
    pub file_name: String,
    pub meta: Meta,
    pub body: String,
    pub warning: Option<String>,
}

impl Entry {
    pub fn read_only(&self) -> bool {
        self.scope == Scope::Builtin
    }

    pub fn title(&self) -> String {
        match self.meta.title.as_deref().map(str::trim) {
            Some(t) if !t.is_empty() => t.to_string(),
            _ => humanize(&self.file_name),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Category {
    pub name: String,
    pub scope: Scope,
    pub pack: Option<String>,
    pub description: String,
    pub icon: Option<String>,
    pub order: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct Pack {
    /// Folder name, e.g. `promptswallet-pack-01M6TCPTTZE1S19QFHPYF0T097`. Used as the key.
    pub folder: String,
    /// The name shown in the app: the name chosen at import, else the `title` in `config.json`.
    pub name: String,
    /// `prompt-pack-id` from `config.json` (falls back to the folder name).
    pub id: String,
    /// `version` from `config.json` (empty if unknown).
    pub version: String,
    /// Ships with the app (cannot be removed or overwritten); otherwise imported.
    pub builtin: bool,
    pub path: PathBuf,
}

#[derive(Debug, Default)]
pub struct Library {
    pub packs: Vec<Pack>,
    pub entries: Vec<Entry>,
    pub categories: Vec<Category>,
}

impl Library {
    pub fn find(&self, id: &str) -> Option<&Entry> {
        self.entries.iter().find(|e| e.id == id)
    }
}

/// "01-30-day-content-calendar.md" -> "01 30 day content calendar"
fn humanize(file_name: &str) -> String {
    let lower = file_name.to_lowercase();
    let stem = if lower.ends_with(".md") || lower.ends_with(".txt") {
        file_name.rsplit_once('.').map(|(s, _)| s).unwrap_or(file_name)
    } else {
        file_name
    };
    stem.replace(['-', '_'], " ")
}

/// Stable id for files that have none (FNV-1a over scope + relative path).
fn path_id(scope: Scope, pack: Option<&str>, category: &str, file_name: &str) -> String {
    let key = match pack {
        Some(p) => format!("{scope:?}:{p}/{category}/{file_name}"),
        None => format!("{scope:?}:{category}/{file_name}"),
    };
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in key.bytes() {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("p-{hash:016x}")
}

pub const PACK_CATEGORIES_DIR: &str = "categories";
pub const PACK_CONFIG_FILE: &str = "config.json";
pub const PACK_README_FILE: &str = "README.md";
pub const PACK_META_FILE: &str = "metadata.json";
pub const PACK_FOLDER_PREFIX: &str = "promptswallet-pack-";
pub const PACK_ID_FIELD: &str = "prompt-pack-id";
pub const PACK_TITLE_FIELD: &str = "title";
pub const PACK_VERSION_FIELD: &str = "version";

/// What is read from a pack's `config.json` and `metadata.json`.
struct PackInfo {
    id: Option<String>,
    title: Option<String>,
    version: Option<String>,
    name: Option<String>,
}

fn json_str(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)?
        .as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn read_json(path: PathBuf) -> Option<serde_json::Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

fn read_pack_info(pack_dir: &Path) -> PackInfo {
    let config = read_json(pack_dir.join(PACK_CONFIG_FILE));
    let meta = read_json(pack_dir.join(PACK_META_FILE));
    let from = |v: &Option<serde_json::Value>, k: &str| v.as_ref().and_then(|v| json_str(v, k));
    PackInfo {
        id: from(&config, PACK_ID_FIELD),
        title: from(&config, PACK_TITLE_FIELD),
        version: from(&config, PACK_VERSION_FIELD),
        name: from(&meta, "name"),
    }
}

fn categories_dir(pack_dir: &Path) -> Option<PathBuf> {
    let dir = pack_dir.join(PACK_CATEGORIES_DIR);
    dir.is_dir().then_some(dir)
}

/// Every pack folder directly inside `root`. Folders without a `categories` folder are skipped.
pub fn list_packs(root: &Path, builtin: bool) -> Vec<Pack> {
    let mut packs: Vec<Pack> = sorted_children(root)
        .into_iter()
        .filter(|p| p.is_dir())
        .filter_map(|path| {
            let folder = path.file_name()?.to_string_lossy().to_string();
            if folder.starts_with('.') || categories_dir(&path).is_none() {
                return None;
            }
            let info = read_pack_info(&path);
            let name = info.name.or(info.title).unwrap_or_else(|| folder.clone());
            Some(Pack {
                id: info.id.unwrap_or_else(|| folder.clone()),
                version: info.version.unwrap_or_default(),
                name,
                folder,
                builtin,
                path,
            })
        })
        .collect();
    packs.sort_by_key(|p| p.name.to_lowercase());
    packs
}

pub fn scan(roots: &Roots) -> Library {
    let mut lib = Library::default();
    let mut seen: HashSet<String> = HashSet::new();
    for (root, builtin) in [(roots.builtin.clone(), true), (roots.imported_dir(), false)] {
        for pack in list_packs(&root, builtin) {
            if let Some(dir) = categories_dir(&pack.path) {
                scan_scope(&dir, Scope::Builtin, Some(&pack.folder), &mut seen, &mut lib);
            }
            lib.packs.push(pack);
        }
    }
    scan_scope(&roots.user_prompts(), Scope::User, None, &mut seen, &mut lib);

    lib.categories.sort_by(|a, b| {
        (a.scope as u8)
            .cmp(&(b.scope as u8))
            .then_with(|| a.pack.cmp(&b.pack))
            .then_with(|| a.order.unwrap_or(i64::MAX).cmp(&b.order.unwrap_or(i64::MAX)))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    lib
}

fn sorted_children(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    paths.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
    paths
}

fn scan_scope(root: &Path, scope: Scope, pack: Option<&str>, seen: &mut HashSet<String>, lib: &mut Library) {
    for dir in sorted_children(root) {
        if !dir.is_dir() {
            continue;
        }
        let Some(name) = dir.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }

        let (description, icon, order) = read_category_info(&dir);
        lib.categories.push(Category {
            name: name.clone(),
            scope,
            pack: pack.map(str::to_string),
            description,
            icon,
            order,
        });

        for file in sorted_children(&dir) {
            let Some(file_name) = file.file_name().map(|n| n.to_string_lossy().to_string()) else {
                continue;
            };
            let lower_name = file_name.to_lowercase();
            let is_prompt = lower_name.ends_with(".md") || lower_name.ends_with(".txt");
            if !is_prompt || file_name.starts_with('_') || file_name.starts_with('.') || !file.is_file()
            {
                continue;
            }
            let Ok(raw) = fs::read_to_string(&file) else {
                continue;
            };
            let parsed = prompt::parse(&raw);
            let mut warning = parsed.warning;

            let declared = parsed.meta.id.clone().filter(|s| !s.trim().is_empty());
            let id = match declared {
                Some(id) if seen.insert(id.clone()) => id,
                other => {
                    if other.is_some() {
                        warning.get_or_insert_with(|| {
                            "Another prompt uses the same id; a new one was assigned.".to_string()
                        });
                    }
                    let id = path_id(scope, pack, &name, &file_name);
                    seen.insert(id.clone());
                    id
                }
            };

            lib.entries.push(Entry {
                id,
                scope,
                pack: pack.map(str::to_string),
                category: name.clone(),
                path: file,
                file_name,
                meta: parsed.meta,
                body: parsed.body,
                warning,
            });
        }
    }
}

fn read_category_info(dir: &Path) -> (String, Option<String>, Option<i64>) {
    let Ok(text) = fs::read_to_string(dir.join("_category.yaml")) else {
        return (String::new(), None, None);
    };
    let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(&text) else {
        return (String::new(), None, None);
    };
    let get_str = |k: &str| {
        value
            .get(k)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    (
        get_str("description").unwrap_or_default(),
        get_str("icon"),
        value.get("order").and_then(|v| v.as_i64()),
    )
}
