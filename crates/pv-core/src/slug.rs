//! Safe names for prompt files and category folders.

use crate::error::{Error, Result};

const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

pub(crate) fn is_reserved(name: &str) -> bool {
    RESERVED.contains(&name.to_lowercase().as_str())
}

/// "My 30-Day Calendar!" -> "my-30-day-calendar". The `.md` extension is not included.
/// Letters from any script are kept, so Urdu / Arabic / CJK names work.
pub fn slugify_file_name(input: &str) -> Result<String> {
    let trimmed = input.trim();
    let lower = trimmed.to_lowercase();
    let stem = lower.strip_suffix(".md").unwrap_or(&lower);

    let mut slug = String::new();
    let mut last_dash = true;
    for c in stem.chars() {
        if c.is_alphanumeric() {
            slug.push(c);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    let slug: String = slug.trim_matches('-').chars().take(80).collect();
    let slug = slug.trim_matches('-').to_string();

    if slug.is_empty() {
        return Err(Error::InvalidName(
            "Please enter a file name (letters or numbers).".into(),
        ));
    }
    if is_reserved(&slug) {
        return Ok(format!("prompt-{slug}"));
    }
    Ok(slug)
}

/// Keeps the name readable ("Client Work") but removes characters that are illegal
/// in folder names on Windows, macOS or Linux.
pub fn sanitize_folder_name(input: &str) -> Result<String> {
    let replaced: String = input
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                ' '
            } else {
                c
            }
        })
        .collect();
    let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim_matches(|c| c == '.' || c == ' ');
    let name: String = trimmed.chars().take(80).collect();
    let name = name.trim_matches(|c| c == '.' || c == ' ').to_string();

    if name.is_empty() {
        return Err(Error::InvalidName("Please enter a category name.".into()));
    }
    if is_reserved(&name) {
        return Err(Error::InvalidName(
            "That name is reserved by the operating system.".into(),
        ));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugifies_names() {
        assert_eq!(slugify_file_name("My 30-Day Calendar!").unwrap(), "my-30-day-calendar");
        assert_eq!(slugify_file_name("  Hello   World  ").unwrap(), "hello-world");
        assert_eq!(slugify_file_name("brand-voice.MD").unwrap(), "brand-voice");
        assert_eq!(slugify_file_name("a/b\\c").unwrap(), "a-b-c");
    }

    #[test]
    fn keeps_non_latin_letters() {
        assert_eq!(slugify_file_name("میرا پرامپٹ").unwrap(), "میرا-پرامپٹ");
    }

    #[test]
    fn rejects_empty_and_symbol_only() {
        assert!(slugify_file_name("").is_err());
        assert!(slugify_file_name(" !!! ").is_err());
        assert!(slugify_file_name(".md").is_err());
    }

    #[test]
    fn avoids_reserved_windows_names() {
        assert_eq!(slugify_file_name("CON").unwrap(), "prompt-con");
    }

    #[test]
    fn long_names_are_truncated() {
        let s = slugify_file_name(&"a".repeat(300)).unwrap();
        assert_eq!(s.chars().count(), 80);
    }

    #[test]
    fn folder_names_are_cleaned() {
        assert_eq!(sanitize_folder_name("Client / Work").unwrap(), "Client Work");
        assert_eq!(sanitize_folder_name("  A   B ").unwrap(), "A B");
        assert_eq!(sanitize_folder_name(".hidden").unwrap(), "hidden");
        assert_eq!(sanitize_folder_name("Prompts for Video Generation").unwrap(), "Prompts for Video Generation");
    }

    #[test]
    fn folder_names_reject_empty_and_traversal() {
        assert!(sanitize_folder_name("").is_err());
        assert!(sanitize_folder_name("..").is_err());
        assert!(sanitize_folder_name("...").is_err());
        assert!(sanitize_folder_name("NUL").is_err());
    }
}
