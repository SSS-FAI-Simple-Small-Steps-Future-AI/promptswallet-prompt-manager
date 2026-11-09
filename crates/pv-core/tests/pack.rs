//! Importing prompts packs (.zip) into the "Prompts Packs" section.
//!
//! A pack zip holds `config.json` ({"prompt-pack-id","title","version"}), a `categories/`
//! folder of category folders with `.md` prompts, and `README.md`.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use pv_core::{Error, PromptUpdate, Vault};
use tempfile::TempDir;
use zip::write::SimpleFileOptions;

const ID_A: &str = "01M6TCPTTZE1S19QFHPYF0T097";
const ID_B: &str = "01M6TCPTTZE1S19QFHPYF0T098";
const README: &[u8] = b"# How to import\n\nOpen Prompts Packs and click Import Prompts Pack.\n";

struct Fx {
    tmp: TempDir,
    workspace: PathBuf,
    vault: Vault,
}

fn fx() -> Fx {
    let tmp = tempfile::tempdir().unwrap();
    let builtin = tmp.path().join("builtin");
    let workspace = tmp.path().join("workspace");
    let pack = builtin.join("promptswallet-pack-BUILTIN0000000000000000000");
    let cat = pack.join("categories").join("Prompts for Testing");
    fs::create_dir_all(&cat).unwrap();
    fs::write(
        pack.join("config.json"),
        "{\"prompt-pack-id\":\"BUILTIN0000000000000000000\",\"title\":\"Shipped pack\",\"version\":\"1.0\"}",
    )
    .unwrap();
    fs::write(cat.join("01.md"), "---\nid: b-1\ntitle: Built in\n---\n\nHello {{NAME}}\n").unwrap();
    let vault = Vault::open(builtin, workspace.clone()).unwrap();
    Fx { tmp, workspace, vault }
}

/// Entries whose name ends in "/" become directories.
fn make_zip(dir: &Path, name: &str, entries: &[(&str, &[u8])]) -> PathBuf {
    let path = dir.join(name);
    let mut zw = zip::ZipWriter::new(fs::File::create(&path).unwrap());
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (n, bytes) in entries {
        if n.ends_with('/') {
            zw.add_directory(*n, opts).unwrap();
        } else {
            zw.start_file(*n, opts).unwrap();
            zw.write_all(bytes).unwrap();
        }
    }
    zw.finish().unwrap();
    path
}

fn config(id: &str, title: &str, version: &str) -> String {
    format!("{{\"prompt-pack-id\": \"{id}\", \"title\": \"{title}\", \"version\": \"{version}\"}}")
}

/// A good pack with two categories.
fn pack_zip(f: &Fx, file: &str, id: &str, title: &str, version: &str) -> PathBuf {
    let cfg = config(id, title, version);
    make_zip(
        f.tmp.path(),
        file,
        &[
            ("config.json", cfg.as_bytes()),
            ("README.md", README),
            ("categories/Marketing/launch.md", b"# Launch\nWrite a launch plan for {{PRODUCT}}.\n"),
            ("categories/Marketing/email.md", b"Write an email.\n"),
            ("categories/Study Helpers/explain.md", b"Explain it simply.\n"),
        ],
    )
}

fn good_pack(f: &Fx, file: &str, id: &str) -> PathBuf {
    pack_zip(f, file, id, "winter-2026-release", "1.0")
}

fn imported_dir(f: &Fx) -> PathBuf {
    f.workspace.join(".promptvault").join("library")
}

fn pack_names(v: &Vault) -> Vec<String> {
    v.tree().unwrap().packs.iter().map(|p| p.name.clone()).collect()
}

fn errors_of(f: &Fx, zip: &Path) -> Vec<String> {
    f.vault.inspect_pack(zip).errors
}

fn assert_nothing_written(f: &Fx) {
    let dir = imported_dir(f);
    let any = dir.exists() && fs::read_dir(&dir).unwrap().next().is_some();
    assert!(!any, "nothing may be written when the pack is invalid");
    assert_eq!(pack_names(&f.vault), vec!["Shipped pack"]);
}

fn all_invalid(errs: &[String]) -> bool {
    !errs.is_empty() && errs.iter().all(|e| e.starts_with("Invalid prompts pack"))
}

// ---------- structure ----------

#[test]
fn valid_pack_is_imported_under_the_name_given_and_stored_with_all_files() {
    let f = fx();
    let zip = good_pack(&f, "promptswallet-pack-x.zip", ID_A);

    let report = f.vault.inspect_pack(&zip);
    assert!(report.is_ok(), "{:?}", report.errors);
    assert_eq!(report.pack_id, ID_A);
    assert_eq!(report.pack_folder, format!("promptswallet-pack-{ID_A}"));
    assert_eq!(report.title, "winter-2026-release");
    assert_eq!(report.version, "1.0");
    assert_eq!(report.prompt_count, 3);
    assert_eq!(report.categories.len(), 2);
    assert!(report.existing.is_none());
    assert_nothing_written(&f); // inspecting writes nothing

    f.vault.import_pack(&zip, "  Winter release  ", false).unwrap();

    // Everything is stored: config.json, README.md, the categories and metadata.
    let dir = imported_dir(&f).join(format!("promptswallet-pack-{ID_A}"));
    assert_eq!(fs::read_to_string(dir.join("config.json")).unwrap(), config(ID_A, "winter-2026-release", "1.0"));
    assert!(fs::read_to_string(dir.join("README.md")).unwrap().contains("How to import"));
    assert!(dir.join("categories/Marketing/launch.md").is_file());
    assert!(dir.join("categories/Study Helpers/explain.md").is_file());
    let meta: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("metadata.json")).unwrap()).unwrap();
    assert_eq!(meta["name"], "Winter release");
    assert_eq!(meta["packId"], ID_A);
    assert_eq!(meta["version"], "1.0");
    assert_eq!(meta["prompts"], 3);

    // The tree shows the chosen name, with categories and prompts.
    let tree = f.vault.tree().unwrap();
    assert_eq!(tree.packs.len(), 2);
    let p = &tree.packs[1];
    assert_eq!(p.name, "Winter release");
    assert_eq!(p.folder, format!("promptswallet-pack-{ID_A}"));
    assert_eq!(p.version, "1.0");
    assert!(!p.builtin);
    let cats: Vec<&str> = p.categories.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(cats, ["Marketing", "Study Helpers"]);
    assert_eq!(p.categories[0].prompts.len(), 2);
    assert!(p.categories.iter().all(|c| c.read_only));
}

#[test]
fn a_wrapper_folder_around_the_three_items_is_looked_through() {
    let f = fx();
    let cfg = config(ID_A, "Wrapped", "2.1");
    let w = format!("promptswallet-pack-{ID_A}");
    let zip = make_zip(
        f.tmp.path(),
        "w.zip",
        &[
            (&format!("{w}/"), b""),
            (&format!("{w}/config.json"), cfg.as_bytes()),
            (&format!("{w}/README.md"), README),
            (&format!("{w}/categories/Ideas/one.md"), b"One.\n"),
        ],
    );
    let report = f.vault.inspect_pack(&zip);
    assert!(report.is_ok(), "{:?}", report.errors);
    assert_eq!(report.version, "2.1");
    f.vault.import_pack(&zip, "Wrapped", false).unwrap();
    assert_eq!(f.vault.tree().unwrap().packs[1].categories[0].name, "Ideas");
}

#[test]
fn each_missing_element_is_an_invalid_prompts_pack() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let cases: [(&str, Vec<(&str, &[u8])>, &str); 3] = [
        ("no-config", vec![("README.md", README), ("categories/A/a.md", b"x\n")], "config.json"),
        ("no-readme", vec![("config.json", cfg.as_bytes()), ("categories/A/a.md", b"x\n")], "README.md"),
        ("no-categories", vec![("config.json", cfg.as_bytes()), ("README.md", README)], "categories"),
    ];
    for (name, entries, missing) in cases {
        let zip = make_zip(f.tmp.path(), &format!("{name}.zip"), &entries);
        let errs = errors_of(&f, &zip);
        assert!(all_invalid(&errs), "{name}: {errs:?}");
        assert!(errs.iter().any(|e| e.contains(missing) && e.contains("missing")), "{name}: {errs:?}");
        assert!(f.vault.import_pack(&zip, "X", false).is_err());
    }
    // Nothing at all: all three are reported together.
    let zip = make_zip(f.tmp.path(), "empty.zip", &[("other.txt", b"hi")]);
    let errs = errors_of(&f, &zip);
    assert_eq!(errs.len(), 3, "{errs:?}");
    assert!(all_invalid(&errs));
    assert_nothing_written(&f);
}

#[test]
fn the_old_prompts_pack_folder_name_is_no_longer_accepted() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let zip = make_zip(
        f.tmp.path(),
        "old.zip",
        &[("config.json", cfg.as_bytes()), ("README.md", README), ("prompts-pack/A/a.md", b"x\n")],
    );
    let errs = errors_of(&f, &zip);
    assert!(errs.iter().any(|e| e.contains("\"categories\" folder is missing")), "{errs:?}");
}

// ---------- config.json ----------

fn config_errors(f: &Fx, cfg: &str) -> Vec<String> {
    let zip = make_zip(
        f.tmp.path(),
        "c.zip",
        &[("config.json", cfg.as_bytes()), ("README.md", README), ("categories/A/a.md", b"x\n")],
    );
    errors_of(f, &zip)
}

#[test]
fn config_json_must_have_exactly_the_three_fields() {
    let f = fx();
    let ok = config(ID_A, "winter-2026-release", "1.0");
    assert!(config_errors(&f, &ok).is_empty());

    let e = config_errors(&f, "not json");
    assert!(all_invalid(&e) && e[0].contains("not valid JSON"), "{e:?}");
    let e = config_errors(&f, "[1,2]");
    assert!(e[0].contains("must be a JSON object"), "{e:?}");

    for (missing, cfg) in [
        ("prompt-pack-id", format!("{{\"title\":\"T\",\"version\":\"1.0\"}}")),
        ("title", format!("{{\"prompt-pack-id\":\"{ID_A}\",\"version\":\"1.0\"}}")),
        ("version", format!("{{\"prompt-pack-id\":\"{ID_A}\",\"title\":\"T\"}}")),
    ] {
        let e = config_errors(&f, &cfg);
        assert!(all_invalid(&e) && e.iter().any(|m| m.contains(&format!("no \"{missing}\" field"))), "{e:?}");
    }

    let e = config_errors(&f, &format!("{{\"prompt-pack-id\":\"{ID_A}\",\"title\":\"T\",\"version\":1.0}}"));
    assert!(e.iter().any(|m| m.contains("\"version\"") && m.contains("non-empty text")), "{e:?}");
    let e = config_errors(&f, &format!("{{\"prompt-pack-id\":\"{ID_A}\",\"title\":\"  \",\"version\":\"1\"}}"));
    assert!(e.iter().any(|m| m.contains("\"title\"")), "{e:?}");

    let e = config_errors(&f, &format!("{{\"prompt-pack-id\":\"{ID_A}\",\"title\":\"T\",\"version\":\"1\",\"extra\":true}}"));
    assert!(e.iter().any(|m| m.contains("unexpected field \"extra\"")), "{e:?}");

    for bad in ["short", "01M6TCPTTZE1S19QFHPYF0T09", "01M6TCPTTZE1S19QFHPYF0T0977", "01M6TCPTTZE1S19QFHPYF0T0-7", "../../../etc/passwd/xxx"] {
        let e = config_errors(&f, &config(bad, "T", "1.0"));
        assert!(e.iter().any(|m| m.contains("26-character ULID")), "{bad}: {e:?}");
    }
    // Lower-case ULIDs are fine.
    assert!(config_errors(&f, &config(&ID_A.to_lowercase(), "T", "1.0")).is_empty());
}

// ---------- categories ----------

#[test]
fn only_md_files_are_allowed_in_categories() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let zip = make_zip(
        f.tmp.path(),
        "bad.zip",
        &[
            ("config.json", cfg.as_bytes()),
            ("README.md", README),
            ("categories/A/ok.md", b"fine\n"),
            ("categories/A/notes.txt", b"text\n"),
            ("categories/A/guide.pdf", b"%PDF"),
            ("categories/A/logo.PNG", b"png"),
            ("categories/A/noext", b"x"),
        ],
    );
    let errs = errors_of(&f, &zip);
    for name in ["notes.txt", "guide.pdf", "logo.PNG", "noext"] {
        assert!(errs.iter().any(|e| e.contains(name)), "{name} not reported: {errs:?}");
    }
    assert!(errs.iter().any(|e| e.contains(".pdf files are not allowed")));
    assert!(!errs.iter().any(|e| e.contains("ok.md")));
    assert!(matches!(f.vault.import_pack(&zip, "X", false), Err(Error::Pack(_))));
    assert_nothing_written(&f);
}

#[test]
fn structure_problems_inside_categories_are_reported() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let zip = make_zip(
        f.tmp.path(),
        "s.zip",
        &[
            ("config.json", cfg.as_bytes()),
            ("README.md", README),
            ("categories/loose.md", b"x\n"),
            ("categories/A/sub/deep.md", b"x\n"),
            ("categories/A/ok.md", b"x\n"),
        ],
    );
    let errs = errors_of(&f, &zip);
    assert!(errs.iter().any(|e| e.contains("loose.md") && e.contains("directly inside")), "{errs:?}");
    assert!(errs.iter().any(|e| e.contains("deep.md") && e.contains("nested")), "{errs:?}");
}

#[test]
fn bad_files_empty_non_utf8_oversized_and_reserved() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let big = vec![b'a'; 1024 * 1024 + 1];
    let zip = make_zip(
        f.tmp.path(),
        "files.zip",
        &[
            ("config.json", cfg.as_bytes()),
            ("README.md", README),
            ("categories/A/empty.md", b"  \n"),
            ("categories/A/binary.md", &[0xff, 0xfe, 0x00, 0x80]),
            ("categories/A/big.md", &big),
            ("categories/A/con.md", b"x\n"),
            ("categories/A/_hidden.md", b"x\n"),
            ("categories/A/ok.md", b"x\n"),
        ],
    );
    let errs = errors_of(&f, &zip);
    for (name, why) in [("empty.md", "empty"), ("binary.md", "UTF-8"), ("big.md", "1 MB"), ("con.md", "reserved"), ("_hidden.md", "reserves")] {
        assert!(errs.iter().any(|e| e.contains(name) && e.contains(why)), "{name}/{why}: {errs:?}");
    }
}

#[test]
fn empty_readme_empty_categories_and_non_zip_are_errors() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let zip = make_zip(
        f.tmp.path(),
        "r.zip",
        &[("config.json", cfg.as_bytes()), ("README.md", b"  \n"), ("categories/A/a.md", b"x\n")],
    );
    assert!(errors_of(&f, &zip).iter().any(|e| e.contains("README.md is empty")));

    let zip = make_zip(f.tmp.path(), "e.zip", &[("config.json", cfg.as_bytes()), ("README.md", README), ("categories/", b"")]);
    assert!(all_invalid(&errors_of(&f, &zip)));

    let not_zip = f.tmp.path().join("fake.zip");
    fs::write(&not_zip, "hello").unwrap();
    assert!(errors_of(&f, &not_zip)[0].contains("not a valid .zip"));
    assert!(errors_of(&f, &f.tmp.path().join("missing.zip"))[0].contains("Could not open"));
    assert_nothing_written(&f);
}

#[test]
fn zip_slip_paths_are_rejected() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let zip = make_zip(
        f.tmp.path(),
        "slip.zip",
        &[
            ("config.json", cfg.as_bytes()),
            ("README.md", README),
            ("categories/A/ok.md", b"fine\n"),
            ("categories/../../evil.md", b"x"),
            ("/abs/evil.md", b"x"),
        ],
    );
    let errs = errors_of(&f, &zip);
    assert_eq!(errs.iter().filter(|e| e.contains("Unsafe path")).count(), 2, "{errs:?}");
    assert!(f.vault.import_pack(&zip, "X", false).is_err());
    assert!(!f.tmp.path().join("evil.md").exists());
    assert_nothing_written(&f);
}

#[test]
fn os_junk_and_extra_files_are_ignored_and_not_stored() {
    let f = fx();
    let cfg = config(ID_A, "T", "1.0");
    let zip = make_zip(
        f.tmp.path(),
        "junk.zip",
        &[
            ("config.json", cfg.as_bytes()),
            ("README.md", README),
            ("LICENSE.txt", b"MIT"),
            ("__MACOSX/._config.json", b"x"),
            (".DS_Store", b"x"),
            ("categories/.DS_Store", b"x"),
            ("categories/A/Thumbs.db", b"x"),
            ("categories/A/a.md", b"fine\n"),
        ],
    );
    let report = f.vault.inspect_pack(&zip);
    assert!(report.is_ok(), "{:?}", report.errors);
    assert!(report.ignored_files >= 4);
    f.vault.import_pack(&zip, "T", false).unwrap();
    assert!(!imported_dir(&f).join(format!("promptswallet-pack-{ID_A}")).join("LICENSE.txt").exists());
}

// ---------- same id: version check ----------

#[test]
fn same_id_and_same_version_is_already_imported() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "Winter", false).unwrap();

    let again = good_pack(&f, "again.zip", ID_A);
    let report = f.vault.inspect_pack(&again);
    assert!(report.is_ok(), "{:?}", report.errors);
    let existing = report.existing.expect("existing pack is found");
    assert_eq!(existing.name, "Winter");
    assert_eq!(existing.version, "1.0");
    assert!(existing.same_version);

    // Importing it is refused, even if the update is confirmed.
    for confirm in [false, true] {
        let err = f.vault.import_pack(&again, "Other name", confirm).unwrap_err().to_string();
        assert!(err.contains("already imported") && err.contains("Winter") && err.contains("1.0"), "{err}");
    }
    assert_eq!(pack_names(&f.vault), vec!["Shipped pack", "Winter"]);
}

#[test]
fn same_id_and_new_version_is_an_update_that_needs_confirmation() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "Winter", false).unwrap();

    // The new version has different content.
    let cfg = config(ID_A, "winter-2026-release", "1.1");
    let v2 = make_zip(
        f.tmp.path(),
        "v2.zip",
        &[
            ("config.json", cfg.as_bytes()),
            ("README.md", README),
            ("categories/Sales/pitch.md", b"Write a pitch.\n"),
        ],
    );
    let report = f.vault.inspect_pack(&v2);
    let existing = report.existing.expect("existing");
    assert_eq!((existing.name.as_str(), existing.version.as_str(), existing.same_version), ("Winter", "1.0", false));
    assert_eq!(report.version, "1.1");

    // Without confirmation nothing changes.
    let err = f.vault.import_pack(&v2, "Winter", false).unwrap_err().to_string();
    assert!(err.contains("Confirm") && err.contains("1.0") && err.contains("1.1"), "{err}");
    assert_eq!(f.vault.tree().unwrap().packs[1].version, "1.0");

    // Confirmed: the old pack is replaced (its own name stays available), the old copy is trashed.
    f.vault.import_pack(&v2, "Winter", true).unwrap();
    let tree = f.vault.tree().unwrap();
    assert_eq!(tree.packs.len(), 2, "only one copy of the pack remains");
    let p = &tree.packs[1];
    assert_eq!((p.name.as_str(), p.version.as_str()), ("Winter", "1.1"));
    let cats: Vec<&str> = p.categories.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(cats, ["Sales"], "the old categories are gone");
    let trash = f.workspace.join(".promptvault").join("trash");
    assert!(trash.is_dir() && fs::read_dir(&trash).unwrap().count() >= 1);
}

#[test]
fn an_update_can_also_rename_the_pack() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "Winter", false).unwrap();
    f.vault.import_pack(&pack_zip(&f, "v2.zip", ID_A, "t", "2.0"), "Winter 2", true).unwrap();
    assert_eq!(pack_names(&f.vault), vec!["Shipped pack", "Winter 2"]);
}

#[test]
fn a_pack_id_used_by_a_shipped_pack_cannot_be_imported() {
    let f = fx();
    let zip = pack_zip(&f, "b.zip", "BUILTIN0000000000000000000", "Clash", "9.9");
    let errs = errors_of(&f, &zip);
    assert!(errs.iter().any(|e| e.contains("ships with the app")), "{errs:?}");
    assert!(f.vault.import_pack(&zip, "Clash", true).is_err());
    assert_nothing_written(&f);
}

#[test]
fn id_match_ignores_upper_and_lower_case() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "A", false).unwrap();
    let report = f.vault.inspect_pack(&pack_zip(&f, "l.zip", &ID_A.to_lowercase(), "t", "1.0"));
    assert!(report.existing.unwrap().same_version);
}

// ---------- names ----------

#[test]
fn a_name_that_is_already_used_is_refused_and_a_new_name_works() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "Winter", false).unwrap();

    let b = pack_zip(&f, "b.zip", ID_B, "winter-2026-release", "1.0");
    for taken in ["Winter", "  winter  ", "WINTER", "Shipped pack"] {
        let err = f.vault.import_pack(&b, taken, false).unwrap_err();
        assert!(matches!(err, Error::InvalidName(_)), "{taken}");
        assert!(err.to_string().contains("already exists"), "{err}");
        assert!(f.vault.pack_name_problem(taken, ID_B).is_some());
    }
    assert_eq!(pack_names(&f.vault), vec!["Shipped pack", "Winter"]);

    assert!(f.vault.pack_name_problem("Brand new", ID_B).is_none());
    f.vault.import_pack(&b, "Winter (copy)", false).unwrap();
    assert_eq!(pack_names(&f.vault), vec!["Shipped pack", "Winter", "Winter (copy)"]);
}

#[test]
fn bad_names_are_refused() {
    let f = fx();
    let zip = good_pack(&f, "a.zip", ID_A);
    for bad in ["", "   ", "tab\there", &"x".repeat(81)] {
        assert!(matches!(f.vault.import_pack(&zip, bad, false), Err(Error::InvalidName(_))), "{bad:?}");
    }
    assert_nothing_written(&f);
}

#[test]
fn different_ids_live_side_by_side() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "One", false).unwrap();
    f.vault.import_pack(&good_pack(&f, "b.zip", ID_B), "Two", false).unwrap();
    assert_eq!(pack_names(&f.vault), vec!["Shipped pack", "One", "Two"]);
}

// ---------- read-only, remove, reopen ----------

#[test]
fn imported_prompts_are_read_only_but_can_be_copied() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "Winter", false).unwrap();
    let tree = f.vault.tree().unwrap();
    let p = &tree.packs[1].categories[0].prompts[0];

    let upd = PromptUpdate { title: "x".into(), description: String::new(), tags: vec![], variables: vec![], body: "x".into() };
    assert!(matches!(f.vault.save(&p.id, upd), Err(Error::ReadOnly)));
    assert!(matches!(f.vault.delete_prompt(&p.id), Err(Error::ReadOnly)));
    assert!(f.vault.delete_category("Marketing").is_err());

    let copy = f.vault.create_from_template(&p.id, "My copy", "Uncategorized").unwrap();
    assert!(!copy.summary.read_only);
    assert_eq!(copy.summary.pack, None);
}

#[test]
fn remove_pack_works_for_imported_only() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "Winter", false).unwrap();
    let folder = format!("promptswallet-pack-{ID_A}");
    f.vault.remove_pack(&folder).unwrap();
    assert_eq!(pack_names(&f.vault), vec!["Shipped pack"]);
    assert!(f.vault.remove_pack(&folder).is_err());
    assert!(f.vault.remove_pack("promptswallet-pack-BUILTIN0000000000000000000").is_err());
    assert!(f.vault.remove_pack("../x").is_err());
    assert!(f.vault.remove_pack("").is_err());
    // After removing it, the same pack can be imported again (even the same version).
    f.vault.import_pack(&good_pack(&f, "a2.zip", ID_A), "Winter", false).unwrap();
}

#[test]
fn imported_packs_and_their_names_survive_reopening_the_vault() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "My Winter Pack", false).unwrap();
    let again = Vault::open(f.tmp.path().join("builtin"), f.workspace.clone()).unwrap();
    assert_eq!(pack_names(&again), vec!["Shipped pack", "My Winter Pack"]);
}

#[test]
fn search_finds_prompts_in_imported_packs() {
    let f = fx();
    f.vault.import_pack(&good_pack(&f, "a.zip", ID_A), "Winter", false).unwrap();
    let hits = f.vault.search("launch plan", 10).unwrap();
    assert!(!hits.is_empty());
}

// ---------- the sample packs shipped in the repo ----------

fn sample(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../samples").join(name)
}

#[test]
fn the_sample_packs_in_the_repo_behave_as_documented() {
    let f = fx();
    let v1 = sample("promptswallet-pack-01M6TCPTTZE1S19QFHPYF0T097.zip");
    let report = f.vault.inspect_pack(&v1);
    assert!(report.is_ok(), "{:?}", report.errors);
    assert_eq!((report.title.as_str(), report.version.as_str()), ("winter-2026-release", "1.0"));
    assert_eq!(report.categories.len(), 2);
    f.vault.import_pack(&v1, &report.title, false).unwrap();

    // The same file again: already imported.
    assert!(f.vault.inspect_pack(&v1).existing.unwrap().same_version);
    // The newer sample: an update.
    let v2 = sample("promptswallet-pack-01M6TCPTTZE1S19QFHPYF0T097-v1.1.zip");
    let r2 = f.vault.inspect_pack(&v2);
    assert!(r2.is_ok(), "{:?}", r2.errors);
    assert!(!r2.existing.as_ref().unwrap().same_version);
    f.vault.import_pack(&v2, &report.title, true).unwrap();
    assert_eq!(f.vault.tree().unwrap().packs[1].version, "1.1");

    // The broken ones.
    let e = f.vault.inspect_pack(&sample("invalid-pack-missing-readme.zip")).errors;
    assert!(all_invalid(&e) && e[0].contains("README.md"), "{e:?}");
    let e = f.vault.inspect_pack(&sample("invalid-pack-bad-files.zip")).errors;
    assert!(e.iter().any(|m| m.contains("notes.txt")) && e.iter().any(|m| m.contains("guide.pdf")), "{e:?}");
    assert!(f.vault.import_pack(&sample("invalid-pack-bad-files.zip"), "x", false).is_err());
    assert_eq!(pack_names(&f.vault).len(), 2);
}
