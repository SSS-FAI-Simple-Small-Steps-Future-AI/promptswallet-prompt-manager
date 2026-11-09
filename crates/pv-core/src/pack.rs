//! Reading a prompts pack (.zip) so it can be imported into the "Prompts Packs" section.
//!
//! A pack zip (named `promptswallet-pack-<ULID>.zip`) contains exactly three things:
//! * `config.json`: `{"prompt-pack-id": "<ULID>", "title": "...", "version": "1.0"}`, nothing else;
//! * a `categories/` folder whose sub-folders are categories holding `.md` prompt files;
//! * `README.md`: how to import the pack in the app.
//!
//! If one of the three is missing the pack is reported as "Invalid prompts pack". All problems
//! are collected and listed together; nothing is written unless there are none. Further rules:
//! * only `.md` files are allowed inside categories; valid UTF-8, not empty, at most 1 MB each;
//! * one wrapper folder around the three items is looked through;
//! * `__MACOSX/`, `.DS_Store`, `Thumbs.db`, `desktop.ini` and `._*` files that Finder or
//!   Explorer add to zips are ignored; other loose files next to `config.json` are ignored too;
//! * paths are never used to write anywhere: names are checked and rebuilt, so
//!   `../evil.md` or absolute paths are rejected ("zip slip").

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufReader, Read, Seek};
use std::path::Path;

use serde::Serialize;

use crate::library::{
    PACK_CATEGORIES_DIR, PACK_CONFIG_FILE, PACK_FOLDER_PREFIX, PACK_ID_FIELD, PACK_README_FILE,
    PACK_TITLE_FIELD, PACK_VERSION_FIELD,
};
use crate::slug::{is_reserved, sanitize_folder_name};

pub const MAX_ZIP_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 3000;
pub const MAX_FILE_BYTES: u64 = 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 50 * 1024 * 1024;
const MAX_CONFIG_BYTES: u64 = 64 * 1024;
const MAX_TITLE_CHARS: usize = 100;
const MAX_VERSION_CHARS: usize = 32;
const MAX_LISTED_ERRORS: usize = 25;
const ULID_LEN: usize = 26;

/// Shown in front of every structural problem.
pub const INVALID: &str = "Invalid prompts pack";

/// The exact shape `config.json` must have, shown in error messages.
const CONFIG_SHAPE: &str = r#"{"prompt-pack-id": "<26-character ULID>", "title": "<name>", "version": "1.0"}"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackCategory {
    pub name: String,
    pub prompt_count: usize,
}

/// A pack with the same `prompt-pack-id` that is already installed.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExistingPackInfo {
    /// Name it is shown under in the app.
    pub name: String,
    pub version: String,
    /// Same version as the zip: there is nothing to update.
    pub same_version: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackReport {
    /// Name of the zip file that was checked.
    pub file_name: String,
    /// `prompt-pack-id` from `config.json` (empty if it could not be read).
    pub pack_id: String,
    /// Folder name the pack gets in the app: `promptswallet-pack-<ULID>`.
    pub pack_folder: String,
    /// `title` from `config.json`: the suggested name for the pack.
    pub title: String,
    pub version: String,
    pub categories: Vec<PackCategory>,
    pub prompt_count: usize,
    /// Junk files added by the OS (e.g. `.DS_Store`) and extra files next to `config.json`.
    pub ignored_files: usize,
    /// Set when a pack with this id is already installed.
    pub existing: Option<ExistingPackInfo>,
    /// Empty when the pack can be imported.
    pub errors: Vec<String>,
}

impl PackReport {
    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }
}

/// A pack that is already installed (shipped with the app, or imported earlier).
#[derive(Debug, Clone)]
pub struct InstalledPack {
    pub id: String,
    pub folder: String,
    pub name: String,
    pub version: String,
    pub builtin: bool,
}

#[derive(Debug, Default)]
pub struct Existing {
    pub packs: Vec<InstalledPack>,
}

pub(crate) struct StagedFile {
    pub category: String,
    pub file_name: String,
    pub text: String,
}

pub(crate) struct Parsed {
    pub report: PackReport,
    pub config_text: String,
    pub readme_text: String,
    pub files: Vec<StagedFile>,
}

#[derive(Default)]
struct Errors {
    shown: Vec<String>,
    total: usize,
}

impl Errors {
    fn push(&mut self, message: impl Into<String>) {
        self.total += 1;
        if self.shown.len() < MAX_LISTED_ERRORS {
            self.shown.push(message.into());
        }
    }

    fn invalid(&mut self, detail: impl std::fmt::Display) {
        self.push(format!("{INVALID}: {detail}"));
    }

    fn finish(mut self) -> Vec<String> {
        if self.total > self.shown.len() {
            let more = self.total - self.shown.len();
            self.shown.push(format!("…and {more} more problem{}.", if more == 1 { "" } else { "s" }));
        }
        self.shown
    }
}

/// `a\b/./c//d` -> `["a","b","c","d"]`; `None` for `..`, absolute paths, drive letters, control chars.
fn normalize(raw: &str) -> Option<Vec<String>> {
    let s = raw.replace('\\', "/");
    if s.starts_with('/') {
        return None;
    }
    let mut segs = Vec::new();
    for part in s.split('/') {
        match part {
            "" | "." => {}
            ".." => return None,
            p if p.chars().any(|c| c.is_control()) => return None,
            p => segs.push(p.to_string()),
        }
    }
    if let Some(first) = segs.first() {
        let b = first.as_bytes();
        if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
            return None;
        }
    }
    Some(segs)
}

fn is_junk(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(lower.as_str(), ".ds_store" | "thumbs.db" | "desktop.ini") || name.starts_with("._")
}

/// One file in the zip (directories are not listed).
struct Item {
    index: usize,
    segs: Vec<String>,
}

/// Lists the files of the zip with checked paths. Nothing is unpacked yet.
fn list_items<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    errors: &mut Errors,
    ignored: &mut usize,
) -> Vec<Item> {
    let mut items = Vec::new();
    for i in 0..archive.len() {
        let entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("Could not read item {} of the zip ({e}). Encrypted or unsupported zips cannot be imported.", i + 1));
                continue;
            }
        };
        let raw = match entry.name() {
            Ok(n) => n.to_string(),
            Err(_) => {
                errors.push(format!("Item {} of the zip has a file name that is not valid text.", i + 1));
                continue;
            }
        };
        let Some(segs) = normalize(&raw) else {
            errors.push(format!("Unsafe path in the zip: \"{raw}\"."));
            continue;
        };
        if segs.iter().any(|s| s == "__MACOSX") {
            *ignored += 1;
            continue;
        }
        if entry.is_dir() {
            continue;
        }
        let Some(last) = segs.last() else { continue };
        if is_junk(last) {
            *ignored += 1;
            continue;
        }
        items.push(Item { index: i, segs });
    }
    items
}

/// Reads one file, at most `limit` bytes. `Ok(None)` means it is larger than the limit.
fn read_limited<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    index: usize,
    limit: u64,
) -> std::result::Result<Option<Vec<u8>>, String> {
    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
    if entry.size() > limit {
        return Ok(None);
    }
    let mut buf = Vec::new();
    (&mut entry).take(limit + 1).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(if buf.len() as u64 > limit { None } else { Some(buf) })
}

fn file_name_problem(name: &str) -> Option<&'static str> {
    if name.chars().any(|c| "<>:\"|?*".contains(c)) {
        return Some("contains a character that is not allowed in file names (< > : \" | ? *)");
    }
    if name.starts_with('.') || name.starts_with('_') {
        return Some("starts with \".\" or \"_\", which the app reserves");
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Some("ends with a dot or a space");
    }
    if name.len() > 150 {
        return Some("has a name longer than 150 characters");
    }
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
    if is_reserved(stem) {
        return Some("uses a name reserved by Windows");
    }
    None
}

fn eq_ci(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}


/// `01M6…` -> `promptswallet-pack-01M6…`.
pub fn pack_folder_name(id: &str) -> String {
    format!("{PACK_FOLDER_PREFIX}{id}")
}

fn empty_report(file_name: String, ignored: usize, errors: Vec<String>) -> Parsed {
    Parsed {
        report: PackReport {
            file_name,
            pack_id: String::new(),
            pack_folder: String::new(),
            title: String::new(),
            version: String::new(),
            categories: Vec::new(),
            prompt_count: 0,
            ignored_files: ignored,
            existing: None,
            errors,
        },
        config_text: String::new(),
        readme_text: String::new(),
        files: Vec::new(),
    }
}

struct Config {
    id: String,
    title: String,
    version: String,
}

fn has_control(s: &str) -> bool {
    s.chars().any(|c| c.is_control())
}

/// `config.json` must be an object with exactly the three fields, all text.
fn parse_config(text: &str, errors: &mut Errors) -> Option<Config> {
    let value = match serde_json::from_str::<serde_json::Value>(text) {
        Ok(v) => v,
        Err(e) => {
            errors.invalid(format!("{PACK_CONFIG_FILE} is not valid JSON ({e}). It must look like {CONFIG_SHAPE}."));
            return None;
        }
    };
    let Some(obj) = value.as_object() else {
        errors.invalid(format!("{PACK_CONFIG_FILE} must be a JSON object like {CONFIG_SHAPE}."));
        return None;
    };
    let before = errors.total;
    let mut field = |key: &str| -> Option<String> {
        match obj.get(key) {
            None => {
                errors.invalid(format!("{PACK_CONFIG_FILE} has no \"{key}\" field."));
                None
            }
            Some(serde_json::Value::String(s)) if !s.trim().is_empty() => Some(s.trim().to_string()),
            Some(_) => {
                errors.invalid(format!("\"{key}\" in {PACK_CONFIG_FILE} must be a non-empty text value."));
                None
            }
        }
    };
    let id = field(PACK_ID_FIELD);
    let title = field(PACK_TITLE_FIELD);
    let version = field(PACK_VERSION_FIELD);
    for key in obj.keys() {
        if ![PACK_ID_FIELD, PACK_TITLE_FIELD, PACK_VERSION_FIELD].contains(&key.as_str()) {
            errors.invalid(format!("{PACK_CONFIG_FILE} has an unexpected field \"{key}\". Only \"{PACK_ID_FIELD}\", \"{PACK_TITLE_FIELD}\" and \"{PACK_VERSION_FIELD}\" are allowed."));
        }
    }
    let (Some(id), Some(title), Some(version)) = (id, title, version) else {
        return None;
    };
    if id.len() != ULID_LEN || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        errors.invalid(format!("\"{PACK_ID_FIELD}\" must be a {ULID_LEN}-character ULID (letters and digits), for example \"01M6TCPTTZE1S19QFHPYF0T097\"."));
    }
    if title.chars().count() > MAX_TITLE_CHARS || has_control(&title) {
        errors.invalid(format!("\"{PACK_TITLE_FIELD}\" must be plain text of at most {MAX_TITLE_CHARS} characters."));
    }
    if version.chars().count() > MAX_VERSION_CHARS || has_control(&version) {
        errors.invalid(format!("\"{PACK_VERSION_FIELD}\" must be plain text of at most {MAX_VERSION_CHARS} characters, for example \"1.0\"."));
    }
    (errors.total == before).then_some(Config { id, title, version })
}

/// Reads a small required text file (config.json, README.md).
fn read_text<R: Read + Seek>(
    archive: &mut zip::ZipArchive<R>,
    item: &Item,
    limit: u64,
    label: &str,
    errors: &mut Errors,
) -> Option<String> {
    match read_limited(archive, item.index, limit) {
        Ok(Some(bytes)) => match String::from_utf8(bytes) {
            Ok(t) => Some(t.trim_start_matches('\u{feff}').to_string()),
            Err(_) => {
                errors.invalid(format!("{label} is not valid UTF-8 text."));
                None
            }
        },
        Ok(None) => {
            errors.invalid(format!("{label} is too large."));
            None
        }
        Err(e) => {
            errors.invalid(format!("{label} could not be read ({e})."));
            None
        }
    }
}

pub(crate) fn parse(path: &Path, existing: &Existing) -> Parsed {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut errors = Errors::default();
    let mut ignored = 0usize;

    // ---- open the zip ----
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(e) => {
            errors.push(format!("Could not open the file: {e}"));
            return empty_report(file_name, 0, errors.finish());
        }
    };
    if !meta.is_file() {
        errors.push("That is not a file. Choose a .zip file.");
        return empty_report(file_name, 0, errors.finish());
    }
    if meta.len() > MAX_ZIP_BYTES {
        errors.push(format!("The zip is larger than {} MB.", MAX_ZIP_BYTES / 1024 / 1024));
        return empty_report(file_name, 0, errors.finish());
    }
    let file = match File::open(path) {
        Ok(f) => f,
        Err(e) => {
            errors.push(format!("Could not open the file: {e}"));
            return empty_report(file_name, 0, errors.finish());
        }
    };
    let mut archive = match zip::ZipArchive::new(BufReader::new(file)) {
        Ok(a) => a,
        Err(_) => {
            errors.push("This is not a valid .zip file. Choose a .zip archive.");
            return empty_report(file_name, 0, errors.finish());
        }
    };
    if archive.len() > MAX_ENTRIES {
        errors.push(format!("The zip has more than {MAX_ENTRIES} items."));
        return empty_report(file_name, 0, errors.finish());
    }

    let items = list_items(&mut archive, &mut errors, &mut ignored);

    // ---- find the three required items ----
    // One wrapper folder around everything (e.g. "promptswallet-pack-01M6…/config.json") is looked through.
    let is_known = |s: &str| eq_ci(s, PACK_CONFIG_FILE) || eq_ci(s, PACK_README_FILE) || eq_ci(s, PACK_CATEGORIES_DIR);
    let tops: HashSet<&str> = items.iter().map(|i| i.segs[0].as_str()).collect();
    let skip = usize::from(
        tops.len() == 1
            && tops.iter().all(|t| !is_known(t))
            && items.iter().all(|i| i.segs.len() >= 2),
    );

    let config_item = items.iter().find(|i| i.segs.len() == skip + 1 && eq_ci(&i.segs[skip], PACK_CONFIG_FILE));
    let readme_item = items.iter().find(|i| i.segs.len() == skip + 1 && eq_ci(&i.segs[skip], PACK_README_FILE));
    let has_categories = items.iter().any(|i| i.segs.len() > skip + 1 && eq_ci(&i.segs[skip], PACK_CATEGORIES_DIR));

    let mut structural = false;
    if config_item.is_none() {
        errors.invalid(format!("\"{PACK_CONFIG_FILE}\" is missing."));
        structural = true;
    }
    if !has_categories {
        errors.invalid(format!("the \"{PACK_CATEGORIES_DIR}\" folder is missing or has no files in it."));
        structural = true;
    }
    if readme_item.is_none() {
        errors.invalid(format!("\"{PACK_README_FILE}\" is missing."));
        structural = true;
    }
    let (Some(config_item), Some(readme_item), false) = (config_item, readme_item, structural) else {
        return empty_report(file_name, ignored, errors.finish());
    };

    // ---- config.json and README.md ----
    let mut config: Option<Config> = None;
    let mut config_text = String::new();
    if let Some(text) = read_text(&mut archive, config_item, MAX_CONFIG_BYTES, PACK_CONFIG_FILE, &mut errors) {
        config = parse_config(&text, &mut errors);
        config_text = text;
    }
    let mut readme_text = String::new();
    if let Some(text) = read_text(&mut archive, readme_item, MAX_FILE_BYTES, PACK_README_FILE, &mut errors) {
        if text.trim().is_empty() {
            errors.invalid(format!("{PACK_README_FILE} is empty."));
        }
        readme_text = text.replace("\r\n", "\n");
    }

    // ---- prompts ----
    // folder name in the zip (lower-case) -> (name as written, files)
    let mut folders: BTreeMap<String, (String, Vec<(String, String)>)> = BTreeMap::new();
    let mut seen_files: HashSet<(String, String)> = HashSet::new();
    let mut reported_clash: HashSet<String> = HashSet::new();
    let mut total: u64 = 0;

    for item in &items {
        if item.segs.len() <= skip {
            continue;
        }
        let rel = &item.segs[skip..];
        if rel.len() == 1 && (eq_ci(&rel[0], PACK_CONFIG_FILE) || eq_ci(&rel[0], PACK_README_FILE)) {
            continue;
        }
        if !eq_ci(&rel[0], PACK_CATEGORIES_DIR) {
            // Anything else next to the three items is not part of the pack.
            ignored += 1;
            continue;
        }
        let shown = item.segs.join("/");
        let inner = &rel[1..];
        match inner.len() {
            0 => continue,
            1 => {
                errors.push(format!("\"{shown}\": is directly inside \"{}\". Put prompt files inside a category folder.", rel[0]));
                continue;
            }
            2 => {}
            _ => {
                errors.push(format!("\"{shown}\": is inside a nested folder. A category folder can only contain prompt files, not more folders."));
                continue;
            }
        }
        let (folder, name) = (&inner[0], &inner[1]);

        match Path::new(name).extension().map(|e| e.to_string_lossy().to_lowercase()) {
            Some(ext) if ext == "md" => {}
            Some(ext) => {
                errors.push(format!("\"{shown}\": .{ext} files are not allowed. Only .md prompt files can be imported."));
                continue;
            }
            None => {
                errors.push(format!("\"{shown}\": has no file extension. Only .md prompt files can be imported."));
                continue;
            }
        }
        if let Some(problem) = file_name_problem(name) {
            errors.push(format!("\"{shown}\": {problem}."));
            continue;
        }
        let bytes = match read_limited(&mut archive, item.index, MAX_FILE_BYTES) {
            Ok(Some(b)) => b,
            Ok(None) => {
                errors.push(format!("\"{shown}\": is larger than 1 MB."));
                continue;
            }
            Err(e) => {
                errors.push(format!("\"{shown}\": could not be read ({e})."));
                continue;
            }
        };
        total += bytes.len() as u64;
        if total > MAX_TOTAL_BYTES {
            errors.push(format!("The pack is larger than {} MB once unpacked.", MAX_TOTAL_BYTES / 1024 / 1024));
            break;
        }
        let text = match String::from_utf8(bytes) {
            Ok(t) => t,
            Err(_) => {
                errors.push(format!("\"{shown}\": is not valid UTF-8 text."));
                continue;
            }
        };
        let text = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
        if text.trim().is_empty() {
            errors.push(format!("\"{shown}\": is empty."));
            continue;
        }

        let key = folder.to_lowercase();
        let slot = folders.entry(key.clone()).or_insert_with(|| (folder.clone(), Vec::new()));
        if slot.0 != *folder {
            if reported_clash.insert(key.clone()) {
                errors.push(format!("The folders \"{}\" and \"{}\" would have the same name on case-insensitive systems.", slot.0, folder));
            }
            continue;
        }
        if !seen_files.insert((key, name.to_lowercase())) {
            errors.push(format!("\"{shown}\": appears twice (file names are compared ignoring upper/lower case)."));
            continue;
        }
        slot.1.push((name.clone(), text));
    }

    let mut categories = Vec::new();
    let mut files = Vec::new();
    let mut bad_folder = false;
    for (_, (folder, list)) in &folders {
        let name = match sanitize_folder_name(folder) {
            Ok(c) => c,
            Err(_) => {
                errors.push(format!("The folder name \"{folder}\" cannot be used as a category name."));
                bad_folder = true;
                continue;
            }
        };
        categories.push(PackCategory { prompt_count: list.len(), name: name.clone() });
        for (file_name, text) in list {
            files.push(StagedFile {
                category: name.clone(),
                file_name: file_name.clone(),
                text: text.clone(),
            });
        }
    }

    // Two folders can clean up to the same name ("A:B" and "A B").
    let mut names: HashMap<String, usize> = HashMap::new();
    for c in &categories {
        *names.entry(c.name.to_lowercase()).or_default() += 1;
    }
    if names.values().any(|n| *n > 1) {
        errors.push("Two folders would end up with the same category name after unsupported characters are removed.");
    }

    if errors.total == 0 && files.is_empty() && !bad_folder {
        errors.push("No prompt files (.md) were found in the pack.");
    }

    // ---- is the id already installed? ----
    let (pack_id, title, version) = config
        .map(|c| (c.id, c.title, c.version))
        .unwrap_or_default();
    let pack_folder = if pack_id.is_empty() { String::new() } else { pack_folder_name(&pack_id) };
    let mut existing_info = None;
    if !pack_id.is_empty() {
        if let Some(found) = existing.packs.iter().find(|p| p.id.eq_ignore_ascii_case(&pack_id)) {
            if found.builtin {
                errors.push(format!("A pack with the id \"{pack_id}\" ships with the app and cannot be replaced."));
            } else {
                existing_info = Some(ExistingPackInfo {
                    name: found.name.clone(),
                    version: found.version.clone(),
                    same_version: found.version.trim() == version.trim(),
                });
            }
        }
    }

    let errors = errors.finish();
    let ok = errors.is_empty();
    let prompt_count = if ok { files.len() } else { 0 };
    Parsed {
        report: PackReport {
            file_name,
            pack_id,
            pack_folder,
            title,
            version,
            categories: if ok { categories } else { Vec::new() },
            prompt_count,
            ignored_files: ignored,
            existing: if ok { existing_info } else { None },
            errors,
        },
        config_text,
        readme_text,
        files: if ok { files } else { Vec::new() },
    }
}
