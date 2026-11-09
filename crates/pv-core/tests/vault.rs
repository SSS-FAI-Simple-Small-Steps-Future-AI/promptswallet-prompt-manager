use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use pv_core::{CategoryNode, Error, PromptUpdate, Scope, Tree, Vault, VariableDef};
use tempfile::TempDir;

/// All categories of all packs, in order.
fn lib_cats(t: &Tree) -> Vec<&CategoryNode> {
    t.packs.iter().flat_map(|p| p.categories.iter()).collect()
}

struct Fixture {
    _tmp: TempDir,
    /// Folder that holds the pack folders (what `Vault::open` receives).
    builtin_root: PathBuf,
    /// The pack's `categories` folder, which holds the categories.
    builtin: PathBuf,
    workspace: PathBuf,
    vault: Vault,
}

fn write(path: &Path, text: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn fixture() -> Fixture {
    let tmp = tempfile::tempdir().unwrap();
    let builtin_root = tmp.path().join("builtin");
    let builtin = builtin_root.join("promptswallet-pack-TEST").join("categories");
    write(
        &builtin_root.join("promptswallet-pack-TEST").join("config.json"),
        "{\"prompt-pack-id\": \"TEST\", \"title\": \"Test pack\", \"version\": \"1.0\"}",
    );
    let workspace = tmp.path().join("workspace");

    let cat = builtin.join("Prompts for Testing");
    write(&cat.join("_category.yaml"), "description: Test prompts\norder: 1\n");
    write(
        &cat.join("01-calendar.md"),
        "---\nid: t-01-calendar\ntitle: Content Calendar\ndescription: Plan a month\ntags: [planning, social]\nvariables:\n  - name: NICHE\n    label: Your niche\n---\n\nPlan posts for a {{NICHE}} creator on {{PLATFORM}}.\n",
    );
    write(
        &cat.join("02-hooks.md"),
        "---\nid: t-02-hooks\ntitle: Hook Generator\ntags: [video]\n---\n\nWrite 15 hooks about cats.\n",
    );
    write(&builtin.join("Second Category").join("a.md"), "No front matter here.\n");

    let vault = Vault::open(builtin_root.clone(), workspace.clone()).unwrap();
    Fixture {
        _tmp: tmp,
        builtin_root,
        builtin,
        workspace,
        vault,
    }
}

fn snapshot(dir: &Path) -> BTreeMap<String, String> {
    fn walk(dir: &Path, base: &Path, out: &mut BTreeMap<String, String>) {
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(&p, base, out);
            } else {
                out.insert(
                    p.strip_prefix(base).unwrap().to_string_lossy().to_string(),
                    fs::read_to_string(&p).unwrap_or_default(),
                );
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(dir, dir, &mut out);
    out
}

fn update(title: &str, body: &str) -> PromptUpdate {
    PromptUpdate {
        title: title.into(),
        description: String::new(),
        tags: vec![],
        variables: vec![],
        body: body.into(),
    }
}

#[test]
fn first_run_creates_uncategorized_and_lists_builtin() {
    let f = fixture();
    assert!(f.workspace.join("My Prompts").join("Uncategorized").is_dir());
    assert!(f.workspace.join("README.txt").is_file());

    let tree = f.vault.tree().unwrap();
    let names: Vec<_> = lib_cats(&tree).iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["Prompts for Testing", "Second Category"]);
    assert!(lib_cats(&tree).iter().all(|c| c.read_only && c.scope == Scope::Builtin));
    assert_eq!(lib_cats(&tree)[0].description, "Test prompts");
    assert_eq!(lib_cats(&tree)[0].prompts.len(), 2);
    assert!(lib_cats(&tree)[0].prompts.iter().all(|p| p.read_only));
    assert_eq!(tree.mine.len(), 1);
    assert_eq!(tree.mine[0].name, "Uncategorized");
}

#[test]
fn existing_workspace_is_not_repopulated() {
    let f = fixture();
    f.vault.delete_category("Uncategorized").unwrap();
    let again = Vault::open(f.builtin_root.clone(), f.workspace.clone()).unwrap();
    assert!(again.tree().unwrap().mine.is_empty());
}

#[test]
fn detail_merges_declared_and_detected_variables() {
    let f = fixture();
    let d = f.vault.get("t-01-calendar").unwrap();
    assert_eq!(d.summary.title, "Content Calendar");
    let names: Vec<_> = d.variables.iter().map(|v| v.name.as_str()).collect();
    assert_eq!(names, ["NICHE", "PLATFORM"]);
    assert_eq!(d.variables[0].label.as_deref(), Some("Your niche"));
    assert_eq!(d.summary.variable_count, 2);
}

#[test]
fn files_without_front_matter_get_a_stable_id_and_title() {
    let f = fixture();
    let tree = f.vault.tree().unwrap();
    let p = &lib_cats(&tree)[1].prompts[0];
    assert_eq!(p.title, "a");
    assert!(p.id.starts_with("p-"));
    let again = f.vault.tree().unwrap();
    assert_eq!(lib_cats(&again)[1].prompts[0].id, p.id);
}

// ---------- read-only guarantee ----------

#[test]
fn builtin_prompts_cannot_be_saved_deleted_or_reverted() {
    let f = fixture();
    let before = snapshot(&f.builtin);

    assert!(matches!(
        f.vault.save("t-01-calendar", update("Hacked", "new body")),
        Err(Error::ReadOnly)
    ));
    assert!(matches!(f.vault.delete_prompt("t-01-calendar"), Err(Error::ReadOnly)));
    assert!(matches!(f.vault.revert_to_original("t-01-calendar"), Err(Error::ReadOnly)));

    assert_eq!(snapshot(&f.builtin), before, "built-in files must be byte-identical");
}

#[test]
fn guard_rejects_builtin_outside_and_traversal_paths() {
    let f = fixture();
    let roots = f.vault.roots();

    let builtin_file = f.builtin.join("Prompts for Testing").join("01-calendar.md");
    assert!(matches!(roots.ensure_writable(&builtin_file), Err(Error::ReadOnly)));

    let new_in_builtin = f.builtin.join("Prompts for Testing").join("new.md");
    assert!(matches!(roots.ensure_writable(&new_in_builtin), Err(Error::ReadOnly)));

    let outside = f.workspace.join("elsewhere.md");
    assert!(matches!(roots.ensure_writable(&outside), Err(Error::OutsideWorkspace)));

    let traversal = f
        .workspace
        .join("My Prompts")
        .join("Uncategorized")
        .join("..")
        .join("..")
        .join("escape.md");
    assert!(matches!(roots.ensure_writable(&traversal), Err(Error::OutsideWorkspace)));

    let into_builtin = f
        .workspace
        .join("My Prompts")
        .join("Uncategorized")
        .join("..")
        .join("..")
        .join("..")
        .join("builtin")
        .join("promptswallet-pack-TEST")
        .join("categories")
        .join("Prompts for Testing")
        .join("01-calendar.md");
    assert!(matches!(roots.ensure_writable(&into_builtin), Err(Error::ReadOnly)));

    let ok = f.workspace.join("My Prompts").join("Uncategorized").join("fine.md");
    assert!(roots.ensure_writable(&ok).is_ok());
}

#[cfg(unix)]
#[test]
fn symlink_into_builtin_is_refused() {
    let f = fixture();
    let link_dir = f.workspace.join("My Prompts").join("Linked");
    fs::create_dir_all(&link_dir).unwrap();
    let link = link_dir.join("sneaky.md");
    std::os::unix::fs::symlink(f.builtin.join("Prompts for Testing").join("01-calendar.md"), &link)
        .unwrap();
    assert!(matches!(f.vault.roots().ensure_writable(&link), Err(Error::ReadOnly)));

    let dangling = link_dir.join("dangling.md");
    std::os::unix::fs::symlink("/nonexistent/target.md", &dangling).unwrap();
    assert!(f.vault.roots().ensure_writable(&dangling).is_err());
}

// ---------- use as template ----------

#[test]
fn use_as_template_makes_an_editable_copy_and_leaves_original_alone() {
    let f = fixture();
    let before = snapshot(&f.builtin);

    let copy = f
        .vault
        .create_from_template("t-01-calendar", "My 30-Day Calendar", "Client Work")
        .unwrap();

    assert_eq!(copy.summary.title, "My 30-Day Calendar");
    assert_eq!(copy.summary.scope, Scope::User);
    assert!(!copy.summary.read_only);
    assert_eq!(copy.summary.derived_from.as_deref(), Some("t-01-calendar"));
    assert_eq!(copy.derived_from_title.as_deref(), Some("Content Calendar"));
    assert_eq!(copy.summary.file_name, "my-30-day-calendar.md");
    assert_eq!(copy.summary.category, "Client Work");
    assert_ne!(copy.summary.id, "t-01-calendar");
    assert_eq!(copy.body, "Plan posts for a {{NICHE}} creator on {{PLATFORM}}.\n");
    assert_eq!(copy.summary.tags, vec!["planning", "social"]);
    assert!(f
        .workspace
        .join("My Prompts")
        .join("Client Work")
        .join("my-30-day-calendar.md")
        .is_file());

    assert_eq!(snapshot(&f.builtin), before);
}

#[test]
fn template_copy_name_collision_is_an_error() {
    let f = fixture();
    f.vault
        .create_from_template("t-02-hooks", "Hooks", "Uncategorized")
        .unwrap();
    let err = f
        .vault
        .create_from_template("t-02-hooks", "hooks", "Uncategorized")
        .unwrap_err();
    assert!(matches!(err, Error::AlreadyExists(_)));
}

#[test]
fn copying_a_missing_prompt_fails() {
    let f = fixture();
    assert!(matches!(
        f.vault.create_from_template("nope", "X", "Uncategorized"),
        Err(Error::NotFound(_))
    ));
}

// ---------- new empty prompt ----------

#[test]
fn new_prompt_creates_a_named_empty_markdown_file() {
    let f = fixture();
    let d = f.vault.create_empty("Uncategorized", "Brand Voice Rewriter").unwrap();
    assert_eq!(d.summary.file_name, "brand-voice-rewriter.md");
    assert_eq!(d.summary.title, "Brand Voice Rewriter");
    assert_eq!(d.body, "");
    assert!(d.summary.derived_from.is_none());
    assert!(f
        .workspace
        .join("My Prompts")
        .join("Uncategorized")
        .join("brand-voice-rewriter.md")
        .is_file());
}

#[test]
fn new_prompt_creates_missing_category_and_rejects_duplicates_and_bad_names() {
    let f = fixture();
    f.vault.create_empty("Brand New", "one").unwrap();
    assert!(f.workspace.join("My Prompts").join("Brand New").is_dir());

    assert!(matches!(f.vault.create_empty("Brand New", "ONE.md"), Err(Error::AlreadyExists(_))));
    assert!(matches!(f.vault.create_empty("Brand New", "!!!"), Err(Error::InvalidName(_))));
    assert!(matches!(f.vault.create_empty("..", "x"), Err(Error::InvalidName(_))));
}

#[test]
fn category_names_cannot_escape_the_workspace() {
    let f = fixture();
    let d = f.vault.create_empty("../../evil", "x").unwrap();
    assert_eq!(d.summary.category, "evil");
    assert!(f.workspace.join("My Prompts").join("evil").join("x.md").is_file());
}

// ---------- editing ----------

#[test]
fn save_updates_file_and_round_trips() {
    let f = fixture();
    let d = f.vault.create_empty("Uncategorized", "draft").unwrap();

    let saved = f
        .vault
        .save(
            &d.summary.id,
            PromptUpdate {
                title: "  Draft v2 ".into(),
                description: "A description".into(),
                tags: vec!["#One".into(), "one".into(), " Two ".into(), "".into()],
                variables: vec![
                    VariableDef {
                        name: "TOPIC".into(),
                        label: Some("Topic".into()),
                        placeholder: None,
                        default: Some("cats".into()),
                    },
                    VariableDef {
                        name: "STALE".into(),
                        label: Some("gone".into()),
                        ..Default::default()
                    },
                ],
                body: "Write about {{TOPIC}}.\r\nSecond line".into(),
            },
        )
        .unwrap();

    assert_eq!(saved.summary.title, "Draft v2");
    assert_eq!(saved.summary.description, "A description");
    assert_eq!(saved.summary.tags, vec!["One", "Two"]);
    assert_eq!(saved.body, "Write about {{TOPIC}}.\nSecond line\n");
    assert_eq!(saved.variables.len(), 1);
    assert_eq!(saved.variables[0].default.as_deref(), Some("cats"));

    let reread = f.vault.get(&d.summary.id).unwrap();
    assert_eq!(reread.body, saved.body);
    assert_eq!(reread.summary.id, d.summary.id);
}

#[test]
fn revert_restores_original_body() {
    let f = fixture();
    let copy = f
        .vault
        .create_from_template("t-02-hooks", "My hooks", "Uncategorized")
        .unwrap();
    f.vault
        .save(&copy.summary.id, update("My hooks", "completely different"))
        .unwrap();
    let reverted = f.vault.revert_to_original(&copy.summary.id).unwrap();
    assert_eq!(reverted.body, "Write 15 hooks about cats.\n");
    assert_eq!(reverted.summary.title, "My hooks");
}

#[test]
fn revert_without_an_original_fails() {
    let f = fixture();
    let d = f.vault.create_empty("Uncategorized", "solo").unwrap();
    assert!(matches!(f.vault.revert_to_original(&d.summary.id), Err(Error::NotFound(_))));
}

#[test]
fn delete_moves_prompt_to_trash() {
    let f = fixture();
    let d = f.vault.create_empty("Uncategorized", "temp").unwrap();
    f.vault.delete_prompt(&d.summary.id).unwrap();
    assert!(matches!(f.vault.get(&d.summary.id), Err(Error::NotFound(_))));
    let trash = f.workspace.join(".promptvault").join("trash");
    let entries: Vec<_> = fs::read_dir(trash).unwrap().collect();
    assert_eq!(entries.len(), 1);
}

#[test]
fn delete_category_moves_folder_and_refuses_builtin_names() {
    let f = fixture();
    f.vault.create_empty("Doomed", "a").unwrap();
    f.vault.delete_category("Doomed").unwrap();
    assert!(!f.workspace.join("My Prompts").join("Doomed").exists());
    assert!(matches!(f.vault.delete_category("Prompts for Testing"), Err(Error::NotFound(_))));
    assert!(f.builtin.join("Prompts for Testing").is_dir());
}

#[test]
fn create_category_twice_is_an_error() {
    let f = fixture();
    assert_eq!(f.vault.create_category("  Work  ").unwrap(), "Work");
    assert!(matches!(f.vault.create_category("Work"), Err(Error::AlreadyExists(_))));
}

// ---------- search, favorites, recents ----------

#[test]
fn search_ranks_title_matches_first_and_requires_all_words() {
    let f = fixture();
    let hits = f.vault.search("calendar", 10).unwrap();
    assert_eq!(hits[0].prompt.id, "t-01-calendar");

    let hits = f.vault.search("hooks cats", 10).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].prompt.id, "t-02-hooks");

    assert!(f.vault.search("calendar cats", 10).unwrap().is_empty());
    assert!(f.vault.search("   ", 10).unwrap().is_empty());
}

#[test]
fn search_covers_user_prompts_too() {
    let f = fixture();
    let d = f.vault.create_empty("Uncategorized", "zebra notes").unwrap();
    let hits = f.vault.search("zebra", 10).unwrap();
    assert_eq!(hits[0].prompt.id, d.summary.id);
}

#[test]
fn favorites_work_for_builtin_prompts_and_persist() {
    let f = fixture();
    assert!(f.vault.toggle_favorite("t-01-calendar").unwrap());
    assert_eq!(f.vault.user_state().favorites, vec!["t-01-calendar"]);

    let reopened = Vault::open(f.builtin_root.clone(), f.workspace.clone()).unwrap();
    assert_eq!(reopened.user_state().favorites, vec!["t-01-calendar"]);

    assert!(!reopened.toggle_favorite("t-01-calendar").unwrap());
    assert!(reopened.user_state().favorites.is_empty());
    assert!(matches!(reopened.toggle_favorite("missing"), Err(Error::NotFound(_))));
}

#[test]
fn recents_are_most_recent_first_and_remember_values() {
    let f = fixture();
    let mut values = BTreeMap::new();
    values.insert("NICHE".to_string(), "cooking".to_string());
    values.insert("EMPTY".to_string(), "  ".to_string());

    f.vault.record_use("t-01-calendar", &values).unwrap();
    f.vault.record_use("t-02-hooks", &BTreeMap::new()).unwrap();
    let state = f.vault.record_use("t-01-calendar", &BTreeMap::new()).unwrap();

    assert_eq!(state.recents, vec!["t-01-calendar", "t-02-hooks"]);
    assert_eq!(state.last_values.get("NICHE").map(String::as_str), Some("cooking"));
    assert!(!state.last_values.contains_key("EMPTY"));
}

#[test]
fn duplicate_ids_are_resolved_without_losing_prompts() {
    let f = fixture();
    let cat = f.workspace.join("My Prompts").join("Uncategorized");
    let text = "---\nid: t-02-hooks\ntitle: Clone\n---\n\nbody\n";
    write(&cat.join("clone.md"), text);

    let tree = f.vault.tree().unwrap();
    let mine = &tree.mine[0].prompts;
    assert_eq!(mine.len(), 1);
    assert_ne!(mine[0].id, "t-02-hooks");
    assert!(mine[0].warning.is_some());
    // the original built-in keeps its id
    assert_eq!(f.vault.get("t-02-hooks").unwrap().summary.title, "Hook Generator");
}

#[test]
fn broken_front_matter_is_listed_with_a_warning() {
    let f = fixture();
    let cat = f.workspace.join("My Prompts").join("Uncategorized");
    write(&cat.join("broken.md"), "---\ntitle: [oops\n---\nstill readable\n");
    let tree = f.vault.tree().unwrap();
    let p = &tree.mine[0].prompts[0];
    assert!(p.warning.is_some());
    assert_eq!(p.title, "broken");
}
