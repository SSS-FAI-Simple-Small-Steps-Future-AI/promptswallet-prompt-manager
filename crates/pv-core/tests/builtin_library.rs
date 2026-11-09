//! Checks the prompts that ship with the app (the `library/` folder at the repo root).
//! Catches typos in front matter, duplicate ids and variables that are declared but unused.

use std::collections::HashSet;
use std::path::PathBuf;

use pv_core::template::extract_variables;
use pv_core::{CategoryNode, Tree, Vault};

fn cats(t: &Tree) -> Vec<&CategoryNode> {
    t.packs.iter().flat_map(|p| p.categories.iter()).collect()
}

fn open() -> (Vault, tempfile::TempDir) {
    let builtin = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../library");
    assert!(builtin.is_dir(), "library folder missing at {builtin:?}");
    let ws = tempfile::tempdir().unwrap();
    let vault = Vault::open(builtin, ws.path().join("PromptVault")).unwrap();
    (vault, ws)
}

#[test]
fn shipped_library_loads_without_warnings() {
    let (vault, _ws) = open();
    let tree = vault.tree().unwrap();
    assert!(cats(&tree).len() >= 2, "expected at least two built-in categories");

    let mut ids = HashSet::new();
    let mut total = 0;
    for cat in cats(&tree) {
        assert!(cat.read_only);
        assert!(!cat.prompts.is_empty(), "category {} is empty", cat.name);
        for p in &cat.prompts {
            total += 1;
            assert!(p.read_only, "{} must be read-only", p.title);
            assert!(p.warning.is_none(), "{}: {:?}", p.file_name, p.warning);
            assert!(!p.title.is_empty());
            assert!(!p.description.is_empty(), "{} has no description", p.file_name);
            assert!(ids.insert(p.id.clone()), "duplicate id {}", p.id);
        }
    }
    assert!(total >= 56, "expected the full pack, found {total}");
}

#[test]
fn every_declared_variable_is_used_and_every_used_variable_is_labelled() {
    let (vault, _ws) = open();
    let tree = vault.tree().unwrap();
    for cat in cats(&tree) {
        for p in &cat.prompts {
            let detail = vault.get(&p.id).unwrap();
            let used = extract_variables(&detail.body);
            assert_eq!(
                used.len(),
                p.variable_count,
                "{}: variable count mismatch",
                p.file_name
            );
            // No leftover [BRACKET] placeholders except the ones that are real wording.
            for token in ["[NICHE]", "[AUDIENCE]", "[TOPIC]", "[PASTE", "[TONE]"] {
                assert!(
                    !detail.body.contains(token),
                    "{} still contains {token}",
                    p.file_name
                );
            }
            for v in &detail.variables {
                assert!(used.contains(&v.name), "{}: stray variable {}", p.file_name, v.name);
                assert!(
                    v.label.is_some(),
                    "{}: variable {} has no label",
                    p.file_name,
                    v.name
                );
            }
        }
    }
}

#[test]
fn shipped_library_cannot_be_modified() {
    let (vault, _ws) = open();
    let tree = vault.tree().unwrap();
    let first = &cats(&tree)[0].prompts[0];
    let update = pv_core::PromptUpdate {
        title: "hacked".into(),
        description: String::new(),
        tags: vec![],
        variables: vec![],
        body: "x".into(),
    };
    assert!(vault.save(&first.id, update).is_err());
    assert!(vault.delete_prompt(&first.id).is_err());
    assert!(vault.delete_category(&cats(&tree)[0].name).is_err());
}

#[test]
fn search_finds_shipped_prompts() {
    let (vault, _ws) = open();
    let hits = vault.search("calendar", 10).unwrap();
    assert!(hits.iter().any(|h| h.prompt.title.contains("Calendar")));
    let hits = vault.search("image-to-video", 10).unwrap();
    assert!(!hits.is_empty());
}
