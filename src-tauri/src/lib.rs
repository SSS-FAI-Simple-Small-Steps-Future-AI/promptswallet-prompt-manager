//! Thin Tauri shell over `pv-core`. All rules (read-only guard, templates, file layout)
//! live in the core crate; these commands only translate between the UI and the vault.

mod net;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use pv_core::{PackReport, PromptDetail, PromptUpdate, SearchHit, Tree, UserState, Vault};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

struct AppState {
    vault: Vault,
}

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command(async)]
fn get_tree(state: State<'_, AppState>) -> CmdResult<Tree> {
    state.vault.tree().map_err(err)
}

#[tauri::command(async)]
fn get_prompt(state: State<'_, AppState>, id: String) -> CmdResult<PromptDetail> {
    state.vault.get(&id).map_err(err)
}

#[tauri::command(async)]
fn search_prompts(state: State<'_, AppState>, query: String) -> CmdResult<Vec<SearchHit>> {
    state.vault.search(&query, 50).map_err(err)
}

#[tauri::command(async)]
fn create_category(state: State<'_, AppState>, name: String) -> CmdResult<String> {
    state.vault.create_category(&name).map_err(err)
}

#[tauri::command(async)]
fn delete_category(state: State<'_, AppState>, name: String) -> CmdResult<()> {
    state.vault.delete_category(&name).map_err(err)
}

#[tauri::command(async)]
fn create_empty_prompt(
    state: State<'_, AppState>,
    category: String,
    file_name: String,
) -> CmdResult<PromptDetail> {
    state.vault.create_empty(&category, &file_name).map_err(err)
}

#[tauri::command(async)]
fn create_from_template(
    state: State<'_, AppState>,
    source_id: String,
    name: String,
    category: String,
) -> CmdResult<PromptDetail> {
    state
        .vault
        .create_from_template(&source_id, &name, &category)
        .map_err(err)
}

#[tauri::command(async)]
fn save_prompt(
    state: State<'_, AppState>,
    id: String,
    update: PromptUpdate,
) -> CmdResult<PromptDetail> {
    state.vault.save(&id, update).map_err(err)
}

#[tauri::command(async)]
fn revert_to_original(state: State<'_, AppState>, id: String) -> CmdResult<PromptDetail> {
    state.vault.revert_to_original(&id).map_err(err)
}

#[tauri::command(async)]
fn delete_prompt(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    state.vault.delete_prompt(&id).map_err(err)
}

#[tauri::command(async)]
fn get_user_state(state: State<'_, AppState>) -> UserState {
    state.vault.user_state()
}

#[tauri::command(async)]
fn toggle_favorite(state: State<'_, AppState>, id: String) -> CmdResult<bool> {
    state.vault.toggle_favorite(&id).map_err(err)
}

#[tauri::command(async)]
fn record_use(
    state: State<'_, AppState>,
    id: String,
    values: BTreeMap<String, String>,
) -> CmdResult<UserState> {
    state.vault.record_use(&id, &values).map_err(err)
}

/// Checks a prompt pack (.zip) and reports what it contains or what is wrong. Writes nothing.
#[tauri::command(async)]
fn inspect_pack(state: State<'_, AppState>, path: String) -> PackReport {
    state.vault.inspect_pack(Path::new(&path))
}

/// Why `name` cannot be used for a pack (`null` if it is fine). `pack_id` is the pack being
/// imported, so that updating a pack may keep its own name.
#[tauri::command(async)]
fn pack_name_problem(state: State<'_, AppState>, name: String, pack_id: String) -> Option<String> {
    state.vault.pack_name_problem(&name, &pack_id)
}

/// Imports a prompts pack into the Prompts Packs section under `name`. Nothing is written if the
/// pack has any problem or the name is taken. `confirm_update` is needed to replace an installed
/// pack that has the same id but another version.
#[tauri::command(async)]
fn import_pack(
    state: State<'_, AppState>,
    path: String,
    name: String,
    confirm_update: Option<bool>,
) -> CmdResult<PackReport> {
    state
        .vault
        .import_pack(Path::new(&path), &name, confirm_update.unwrap_or(false))
        .map_err(err)
}

/// Removes an imported prompts pack (moved to the trash).
#[tauri::command(async)]
fn remove_pack(state: State<'_, AppState>, name: String) -> CmdResult<()> {
    state.vault.remove_pack(&name).map_err(err)
}

/// "Rewrite with AI": asks the NVIDIA chat API (at `url`, with `model`) to rewrite `text` for the
/// chosen LLM and returns the new text. The key comes from Settings; when it is empty the
/// `NVIDIA_API_KEY` environment variable is used.
#[tauri::command]
async fn rewrite_prompt(
    url: String,
    model: String,
    api_key: Option<String>,
    text: String,
    context: String,
    target_llm: String,
) -> CmdResult<String> {
    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .or_else(|| std::env::var("NVIDIA_API_KEY").ok())
        .unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        net::optimize_prompt(&net::RewriteRequest {
            endpoint: &url,
            model: &model,
            api_key: &key,
            text: &text,
            context: &context,
            target_llm: &target_llm,
        })
    })
    .await
    .map_err(err)?
}

/// Fetches the advertisement JSON from `url` (banner image included as a data: URL).
#[tauri::command]
async fn fetch_ad(url: String) -> CmdResult<serde_json::Value> {
    tauri::async_runtime::spawn_blocking(move || net::fetch_ad(&url))
        .await
        .map_err(err)?
}

#[tauri::command(async)]
fn workspace_path(state: State<'_, AppState>) -> String {
    state.vault.roots().workspace.to_string_lossy().to_string()
}

#[tauri::command(async)]
fn reveal_workspace(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let path = state.vault.roots().workspace.to_string_lossy().to_string();
    app.opener().open_path(path, None::<&str>).map_err(err)
}

/// Finds the folder with the read-only prompts that ship with the app.
/// Several locations are tried because installers lay resources out differently per OS.
fn resolve_builtin_root(app: &AppHandle) -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(p) = std::env::var("PROMPTVAULT_BUILTIN") {
        candidates.push(PathBuf::from(p));
    }
    if cfg!(debug_assertions) {
        candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../library"));
    }
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("library"));
        candidates.push(res.join("_up_").join("library"));
        candidates.push(res.join("resources").join("library"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("library"));
            candidates.push(dir.join("../Resources/library"));
        }
    }

    candidates
        .iter()
        .find(|p| p.is_dir())
        .cloned()
        .unwrap_or_else(|| {
            // Nothing found: use a path that does not exist; the library will simply be empty.
            candidates.into_iter().next().unwrap_or_else(|| PathBuf::from("library"))
        })
}

/// `$PROMPTVAULT_HOME` if set, else `~/Documents/PromptVault`.
fn default_workspace(app: &AppHandle) -> PathBuf {
    if let Ok(p) = std::env::var("PROMPTVAULT_HOME") {
        return PathBuf::from(p);
    }
    app.path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("PromptVault")
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();
            let builtin = resolve_builtin_root(handle);
            let vault = match Vault::open(builtin.clone(), default_workspace(handle)) {
                Ok(v) => v,
                Err(first) => {
                    // Documents folder not writable (sandbox, policy...): fall back to app data.
                    let fallback = handle.path().app_data_dir()?.join("PromptVault");
                    Vault::open(builtin, fallback).map_err(|second| {
                        format!("could not open the prompt workspace: {first}; fallback: {second}")
                    })?
                }
            };
            app.manage(AppState { vault });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_tree,
            get_prompt,
            search_prompts,
            create_category,
            delete_category,
            create_empty_prompt,
            create_from_template,
            save_prompt,
            revert_to_original,
            delete_prompt,
            get_user_state,
            toggle_favorite,
            record_use,
            inspect_pack,
            pack_name_problem,
            import_pack,
            remove_pack,
            rewrite_prompt,
            fetch_ad,
            workspace_path,
            reveal_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PromptVault");
}
