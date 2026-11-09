//! The public API of the core: everything the app can do with prompts.
//!
//! Reads rescan the folders (cheap for thousands of small files and always correct
//! when files change outside the app). Writes are serialised with a mutex, written
//! atomically, and checked by [`Roots::ensure_writable`] first.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use chrono::Local;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::guard::Roots;
use crate::library::{self, Entry, Library, Scope};
use crate::pack::{self, PackReport};
use crate::prompt::{self, Meta, VariableDef};
use crate::slug::{sanitize_folder_name, slugify_file_name};
use crate::state::UserState;
use crate::template;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub category: String,
    /// Folder name of the prompts pack (`None` for My Prompts).
    pub pack: Option<String>,
    pub scope: Scope,
    pub read_only: bool,
    pub derived_from: Option<String>,
    pub file_name: String,
    pub variable_count: usize,
    pub updated: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDetail {
    #[serde(flatten)]
    pub summary: PromptSummary,
    pub body: String,
    pub variables: Vec<VariableDef>,
    pub target_models: Vec<String>,
    /// Title of the prompt this one was copied from, if that prompt still exists.
    pub derived_from_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryNode {
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub scope: Scope,
    pub read_only: bool,
    pub pack: Option<String>,
    pub prompts: Vec<PromptSummary>,
}

/// A prompts pack: pack > categories > prompts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackNode {
    /// The name shown in the app (chosen when the pack was imported).
    pub name: String,
    /// Folder name `promptswallet-pack-<ULID>`; the key the rest of the app uses.
    pub folder: String,
    /// `prompt-pack-id` from its config.json.
    pub pack_id: String,
    pub version: String,
    /// Ships with the app. Imported packs (`false`) can be removed.
    pub builtin: bool,
    pub categories: Vec<CategoryNode>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Tree {
    pub packs: Vec<PackNode>,
    pub mine: Vec<CategoryNode>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptUpdate {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub variables: Vec<VariableDef>,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchHit {
    pub prompt: PromptSummary,
    pub score: u32,
}

pub struct Vault {
    roots: Roots,
    write_lock: Mutex<()>,
}

pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn new_id() -> String {
    ulid::Ulid::new().to_string()
}

/// Write via a temp file in the same folder, then rename, so a crash never leaves half a file.
pub(crate) fn write_atomic(path: &Path, contents: &str) -> Result<()> {
    let dir = path.parent().ok_or(Error::OutsideWorkspace)?;
    fs::create_dir_all(dir)?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let tmp = dir.join(format!(".{name}.tmp"));
    fs::write(&tmp, contents)?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

fn summary(e: &Entry) -> PromptSummary {
    PromptSummary {
        id: e.id.clone(),
        title: e.title(),
        description: e.meta.description.clone().unwrap_or_default(),
        tags: e.meta.tags.clone(),
        category: e.category.clone(),
        pack: e.pack.clone(),
        scope: e.scope,
        read_only: e.read_only(),
        derived_from: e.meta.derived_from.clone(),
        file_name: e.file_name.clone(),
        variable_count: template::extract_variables(&e.body).len(),
        updated: e.meta.updated.clone(),
        warning: e.warning.clone(),
    }
}

fn detail(lib: &Library, e: &Entry) -> PromptDetail {
    let derived_from_title = e
        .meta
        .derived_from
        .as_deref()
        .and_then(|id| lib.find(id))
        .map(|o| o.title());
    PromptDetail {
        summary: summary(e),
        body: e.body.clone(),
        variables: template::merge_variables(&e.meta.variables, &e.body),
        target_models: e.meta.target_models.clone(),
        derived_from_title,
    }
}

fn find<'a>(lib: &'a Library, id: &str) -> Result<&'a Entry> {
    lib.find(id).ok_or_else(|| Error::NotFound(id.to_string()))
}

fn clean_tags(tags: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t = t.trim().trim_start_matches('#').trim().to_string();
        if !t.is_empty() && !out.iter().any(|x| x.eq_ignore_ascii_case(&t)) {
            out.push(t);
        }
    }
    out
}

impl Vault {
    pub fn open(builtin: PathBuf, workspace: PathBuf) -> Result<Vault> {
        let roots = Roots::new(builtin, workspace)?;
        roots.ensure_layout()?;
        Ok(Vault {
            roots,
            write_lock: Mutex::new(()),
        })
    }

    pub fn roots(&self) -> &Roots {
        &self.roots
    }

    fn lock(&self) -> MutexGuard<'_, ()> {
        self.write_lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn scan(&self) -> Library {
        library::scan(&self.roots)
    }

    fn state_path(&self) -> PathBuf {
        self.roots.state_dir().join("state.json")
    }

    // ---------- reading ----------

    pub fn tree(&self) -> Result<Tree> {
        let lib = self.scan();
        let node = |c: &library::Category| CategoryNode {
            name: c.name.clone(),
            description: c.description.clone(),
            icon: c.icon.clone(),
            scope: c.scope,
            read_only: c.scope == Scope::Builtin,
            pack: c.pack.clone(),
            prompts: lib
                .entries
                .iter()
                .filter(|e| e.scope == c.scope && e.pack == c.pack && e.category == c.name)
                .map(summary)
                .collect(),
        };
        let packs = lib
            .packs
            .iter()
            .map(|p| PackNode {
                name: p.name.clone(),
                folder: p.folder.clone(),
                pack_id: p.id.clone(),
                version: p.version.clone(),
                builtin: p.builtin,
                categories: lib
                    .categories
                    .iter()
                    .filter(|c| c.pack.as_deref() == Some(p.folder.as_str()))
                    .map(node)
                    .collect(),
            })
            .collect();
        let mine = lib
            .categories
            .iter()
            .filter(|c| c.scope == Scope::User)
            .map(node)
            .collect();
        Ok(Tree { packs, mine })
    }

    pub fn get(&self, id: &str) -> Result<PromptDetail> {
        let lib = self.scan();
        Ok(detail(&lib, find(&lib, id)?))
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let tokens: Vec<String> = query.split_whitespace().map(|t| t.to_lowercase()).collect();
        if tokens.is_empty() {
            return Ok(Vec::new());
        }
        let lib = self.scan();
        let mut hits: Vec<SearchHit> = Vec::new();
        for e in &lib.entries {
            let title = e.title().to_lowercase();
            let desc = e.meta.description.clone().unwrap_or_default().to_lowercase();
            let tags = e.meta.tags.join(" ").to_lowercase();
            let category = e.category.to_lowercase();
            let body = e.body.to_lowercase();

            let mut score = 0u32;
            let mut all_match = true;
            for t in &tokens {
                let mut s = 0u32;
                if title.contains(t.as_str()) {
                    s += 10;
                    if title.starts_with(t.as_str()) {
                        s += 3;
                    }
                }
                if tags.contains(t.as_str()) {
                    s += 5;
                }
                if desc.contains(t.as_str()) {
                    s += 3;
                }
                if category.contains(t.as_str()) {
                    s += 2;
                }
                if body.contains(t.as_str()) {
                    s += 1;
                }
                if s == 0 {
                    all_match = false;
                    break;
                }
                score += s;
            }
            if all_match {
                hits.push(SearchHit {
                    prompt: summary(e),
                    score,
                });
            }
        }
        hits.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then_with(|| a.prompt.title.to_lowercase().cmp(&b.prompt.title.to_lowercase()))
        });
        hits.truncate(limit);
        Ok(hits)
    }

    // ---------- categories ----------

    pub fn create_category(&self, name: &str) -> Result<String> {
        let _g = self.lock();
        let name = sanitize_folder_name(name)?;
        let dir = self.roots.user_prompts().join(&name);
        self.roots.ensure_writable(&dir)?;
        if dir.exists() {
            return Err(Error::AlreadyExists(name));
        }
        fs::create_dir_all(&dir)?;
        Ok(name)
    }

    /// Moves a user category (and its prompts) to the trash. Built-in categories are refused.
    pub fn delete_category(&self, name: &str) -> Result<()> {
        let _g = self.lock();
        let name = sanitize_folder_name(name)?;
        let dir = self.roots.user_prompts().join(&name);
        if !dir.is_dir() {
            return Err(Error::NotFound(name));
        }
        let dir = self.roots.ensure_writable(&dir)?;
        self.move_to_trash(&dir)
    }

    // ---------- prompt packs ----------

    /// Every installed pack (shipped and imported).
    fn existing_packs(&self) -> pack::Existing {
        let mut packs = Vec::new();
        for (root, builtin) in [(self.roots.builtin.clone(), true), (self.roots.imported_dir(), false)] {
            for p in library::list_packs(&root, builtin) {
                packs.push(pack::InstalledPack {
                    id: p.id,
                    folder: p.folder,
                    name: p.name,
                    version: p.version,
                    builtin,
                });
            }
        }
        pack::Existing { packs }
    }

    /// Checks a pack without writing anything. Problems are listed in the report.
    pub fn inspect_pack(&self, zip_path: &Path) -> PackReport {
        pack::parse(zip_path, &self.existing_packs()).report
    }

    /// Why `name` cannot be used for a pack (`None` if it is fine). `pack_id` is the pack being
    /// imported: when an older version of it is being replaced, its own name stays available.
    pub fn pack_name_problem(&self, name: &str, pack_id: &str) -> Option<String> {
        pack_name_problem(name, pack_id, &self.existing_packs())
    }

    /// Imports a pack into "Prompts Packs" under the name `name`.
    ///
    /// Nothing is written if the pack has a problem or the name is taken. If a pack with the same
    /// `prompt-pack-id` is installed: the same version is refused ("already imported"); a different
    /// version needs `confirm_update`, and then the old copy is removed (moved to the trash).
    pub fn import_pack(&self, zip_path: &Path, name: &str, confirm_update: bool) -> Result<PackReport> {
        let _g = self.lock();
        let existing = self.existing_packs();
        let parsed = pack::parse(zip_path, &existing);
        if !parsed.report.is_ok() {
            let list: Vec<String> = parsed.report.errors.iter().map(|e| format!("• {e}")).collect();
            return Err(Error::Pack(format!("The pack was not imported:\n{}", list.join("\n"))));
        }
        if let Some(old) = &parsed.report.existing {
            if old.same_version {
                return Err(Error::Pack(format!(
                    "This prompts pack is already imported as \"{}\" (version {}).",
                    old.name, old.version
                )));
            }
            if !confirm_update {
                return Err(Error::Pack(format!(
                    "\"{}\" is already imported with version {}. Confirm to update it to version {}.",
                    old.name, old.version, parsed.report.version
                )));
            }
        }
        let name = name.trim().to_string();
        if let Some(problem) = pack_name_problem(&name, &parsed.report.pack_id, &existing) {
            return Err(Error::InvalidName(problem));
        }

        let imported = self.roots.imported_dir();
        let folder = parsed.report.pack_folder.clone();
        let stage = self.roots.state_dir().join(format!("tmp-import-{}", new_id()));
        let result = (|| -> Result<()> {
            let root = stage.join(&folder);
            let categories = root.join(library::PACK_CATEGORIES_DIR);
            fs::create_dir_all(&categories)?;
            fs::write(root.join(library::PACK_CONFIG_FILE), &parsed.config_text)?;
            fs::write(root.join(library::PACK_README_FILE), &parsed.readme_text)?;
            for f in &parsed.files {
                let dir = categories.join(&f.category);
                fs::create_dir_all(&dir)?;
                fs::write(dir.join(&f.file_name), &f.text)?;
            }
            let meta = serde_json::json!({
                "name": name,
                "packId": parsed.report.pack_id,
                "title": parsed.report.title,
                "version": parsed.report.version,
                "importedAt": today(),
                "sourceFile": parsed.report.file_name,
                "categories": parsed.report.categories.len(),
                "prompts": parsed.report.prompt_count,
            });
            fs::write(root.join(library::PACK_META_FILE), serde_json::to_string_pretty(&meta)?)?;
            fs::create_dir_all(&imported)?;
            for old in library::list_packs(&imported, false) {
                if old.id.eq_ignore_ascii_case(&parsed.report.pack_id) || old.folder.eq_ignore_ascii_case(&folder) {
                    self.move_to_trash(&old.path)?;
                }
            }
            fs::rename(&root, imported.join(&folder))?;
            Ok(())
        })();
        let _ = fs::remove_dir_all(&stage);
        result?;
        Ok(parsed.report)
    }

    /// Removes an imported pack (moved to the trash). Packs that ship with the app are refused.
    pub fn remove_pack(&self, name: &str) -> Result<()> {
        let _g = self.lock();
        if name.trim().is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
            return Err(Error::InvalidName("That is not an imported prompts pack.".into()));
        }
        let dir = self.roots.imported_dir().join(name);
        if !dir.is_dir() {
            return Err(Error::NotFound(name.to_string()));
        }
        self.move_to_trash(&dir)
    }

    // ---------- prompts ----------

    /// New empty prompt file `<category>/<slug>.md`. The category is created if needed.
    pub fn create_empty(&self, category: &str, file_name: &str) -> Result<PromptDetail> {
        let _g = self.lock();
        let category = sanitize_folder_name(category)?;
        let slug = slugify_file_name(file_name)?;
        let title = file_name
            .trim()
            .trim_end_matches(".md")
            .trim_end_matches(".MD")
            .trim()
            .to_string();

        let meta = Meta {
            id: Some(new_id()),
            title: Some(if title.is_empty() { slug.clone() } else { title }),
            created: Some(today()),
            updated: Some(today()),
            ..Default::default()
        };
        let id = meta.id.clone().unwrap_or_default();
        self.write_new(&category, &slug, &meta, "")?;
        self.get(&id)
    }

    /// Copies any prompt (usually a built-in one) into the user's workspace as a new,
    /// editable prompt. The original is never touched.
    pub fn create_from_template(
        &self,
        source_id: &str,
        name: &str,
        category: &str,
    ) -> Result<PromptDetail> {
        let _g = self.lock();
        let lib = self.scan();
        let src = find(&lib, source_id)?;
        let category = sanitize_folder_name(category)?;
        let slug = slugify_file_name(name)?;
        let title = name.trim().trim_end_matches(".md").trim().to_string();

        let meta = Meta {
            id: Some(new_id()),
            title: Some(if title.is_empty() { slug.clone() } else { title }),
            description: src.meta.description.clone(),
            tags: src.meta.tags.clone(),
            target_models: src.meta.target_models.clone(),
            variables: src.meta.variables.clone(),
            derived_from: Some(src.id.clone()),
            created: Some(today()),
            updated: Some(today()),
            extra: BTreeMap::new(),
        };
        let id = meta.id.clone().unwrap_or_default();
        self.write_new(&category, &slug, &meta, &src.body)?;
        self.get(&id)
    }

    pub fn save(&self, id: &str, update: PromptUpdate) -> Result<PromptDetail> {
        let _g = self.lock();
        let lib = self.scan();
        let entry = find(&lib, id)?;
        if entry.read_only() {
            return Err(Error::ReadOnly);
        }
        let path = self.roots.ensure_writable(&entry.path)?;

        let body = update.body.replace("\r\n", "\n");
        let mut meta = entry.meta.clone();
        meta.id = Some(entry.id.clone());
        let title = update.title.trim();
        meta.title = Some(if title.is_empty() {
            entry.title()
        } else {
            title.to_string()
        });
        let description = update.description.trim();
        meta.description = (!description.is_empty()).then(|| description.to_string());
        meta.tags = clean_tags(&update.tags);
        meta.variables = template::normalize_defs(&body, &update.variables);
        meta.updated = Some(today());
        if meta.created.is_none() {
            meta.created = Some(today());
        }

        write_atomic(&path, &prompt::serialize(&meta, &body))?;
        self.get(id)
    }

    /// Replaces the body and variable settings of a copy with those of the prompt it came from.
    pub fn revert_to_original(&self, id: &str) -> Result<PromptDetail> {
        let _g = self.lock();
        let lib = self.scan();
        let entry = find(&lib, id)?;
        if entry.read_only() {
            return Err(Error::ReadOnly);
        }
        let path = self.roots.ensure_writable(&entry.path)?;
        let origin_id = entry
            .meta
            .derived_from
            .clone()
            .ok_or_else(|| Error::NotFound("original prompt".into()))?;
        let origin = find(&lib, &origin_id)?;

        let mut meta = entry.meta.clone();
        meta.id = Some(entry.id.clone());
        meta.variables = origin.meta.variables.clone();
        meta.updated = Some(today());
        write_atomic(&path, &prompt::serialize(&meta, &origin.body))?;
        self.get(id)
    }

    /// Moves a user prompt to `.promptvault/trash`. Built-in prompts are refused.
    pub fn delete_prompt(&self, id: &str) -> Result<()> {
        let _g = self.lock();
        let lib = self.scan();
        let entry = find(&lib, id)?;
        if entry.read_only() {
            return Err(Error::ReadOnly);
        }
        let path = self.roots.ensure_writable(&entry.path)?;
        self.move_to_trash(&path)
    }

    // ---------- favorites, recents, remembered values ----------

    pub fn user_state(&self) -> UserState {
        UserState::load(&self.state_path())
    }

    /// Returns the new favorite status.
    pub fn toggle_favorite(&self, id: &str) -> Result<bool> {
        let _g = self.lock();
        find(&self.scan(), id)?;
        let mut state = UserState::load(&self.state_path());
        let now = state.toggle_favorite(id);
        state.save(&self.state_path())?;
        Ok(now)
    }

    /// Called after a prompt is copied: moves it to the top of Recent and remembers
    /// the non-empty variable values for next time.
    pub fn record_use(&self, id: &str, values: &BTreeMap<String, String>) -> Result<UserState> {
        let _g = self.lock();
        find(&self.scan(), id)?;
        let mut state = UserState::load(&self.state_path());
        state.push_recent(id);
        for (k, v) in values {
            if !v.trim().is_empty() {
                state.last_values.insert(k.clone(), v.clone());
            }
        }
        state.save(&self.state_path())?;
        Ok(state)
    }

    // ---------- internals ----------

    fn write_new(&self, category: &str, slug: &str, meta: &Meta, body: &str) -> Result<()> {
        let dir = self.roots.user_prompts().join(category);
        fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{slug}.md"));
        let path = self.roots.ensure_writable(&path)?;
        if path.exists() {
            return Err(Error::AlreadyExists(format!("{slug}.md")));
        }
        write_atomic(&path, &prompt::serialize(meta, body))
    }

    fn move_to_trash(&self, path: &Path) -> Result<()> {
        let trash = self.roots.trash_dir();
        fs::create_dir_all(&trash)?;
        let stamp = Local::now().format("%Y%m%d-%H%M%S");
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "item".into());
        let mut target = trash.join(format!("{stamp}-{name}"));
        let mut n = 2;
        while target.exists() {
            target = trash.join(format!("{stamp}-{n}-{name}"));
            n += 1;
        }
        fs::rename(path, target)?;
        Ok(())
    }
}

const MAX_PACK_NAME_CHARS: usize = 80;

/// Rules for the name a pack is shown under: not empty, plain text, and not used by another pack.
fn pack_name_problem(name: &str, pack_id: &str, existing: &pack::Existing) -> Option<String> {
    let name = name.trim();
    if name.is_empty() {
        return Some("Enter a name for the prompts pack.".into());
    }
    if name.chars().count() > MAX_PACK_NAME_CHARS || name.chars().any(|c| c.is_control()) {
        return Some(format!("The name must be plain text of at most {MAX_PACK_NAME_CHARS} characters."));
    }
    let taken = existing
        .packs
        .iter()
        .any(|p| !p.id.eq_ignore_ascii_case(pack_id) && p.name.trim().to_lowercase() == name.to_lowercase());
    taken.then(|| format!("A prompts pack named \"{name}\" already exists. Choose another name."))
}
