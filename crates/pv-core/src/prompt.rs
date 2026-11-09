//! Prompt files: Markdown with an optional YAML front matter block.
//!
//! ```text
//! ---
//! id: cc-01-30-day-content-calendar
//! title: 30-Day Content Calendar
//! tags: [planning]
//! variables:
//!   - name: NICHE
//!     label: Your niche
//! ---
//!
//! Create a calendar for a {{NICHE}} creator...
//! ```
//!
//! Front matter is read leniently (numbers become strings, unknown keys are kept)
//! so hand-edited files never break the app.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct VariableDef {
    pub name: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub default: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Meta {
    pub id: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub target_models: Vec<String>,
    pub variables: Vec<VariableDef>,
    pub derived_from: Option<String>,
    pub created: Option<String>,
    pub updated: Option<String>,
    /// Unknown front-matter keys, preserved when the file is saved again.
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone)]
pub struct ParsedFile {
    pub meta: Meta,
    pub body: String,
    /// Set when the front matter could not be read; `body` then holds the whole file.
    pub warning: Option<String>,
}

fn scalar(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn string_list(v: &Value) -> Vec<String> {
    match v {
        Value::Sequence(items) => items
            .iter()
            .filter_map(scalar)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect(),
        Value::String(s) => s
            .split(',')
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn parse_variables(v: &Value) -> Vec<VariableDef> {
    let Value::Sequence(items) = v else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in items {
        match item {
            Value::String(name) => out.push(VariableDef {
                name: name.trim().to_string(),
                ..Default::default()
            }),
            Value::Mapping(m) => {
                let get = |k: &str| m.get(k).and_then(scalar);
                if let Some(name) = get("name") {
                    out.push(VariableDef {
                        name: name.trim().to_string(),
                        label: get("label"),
                        placeholder: get("placeholder"),
                        default: get("default"),
                    });
                }
            }
            _ => {}
        }
    }
    out.retain(|d| !d.name.is_empty());
    out
}

impl Meta {
    pub fn from_yaml(text: &str) -> Result<Meta, String> {
        let value: Value = serde_yaml::from_str(text).map_err(|e| e.to_string())?;
        let map = match value {
            Value::Null => return Ok(Meta::default()),
            Value::Mapping(m) => m,
            _ => return Err("front matter must be key: value pairs".to_string()),
        };
        let mut meta = Meta::default();
        for (key, value) in map {
            let Value::String(key) = key else { continue };
            match key.as_str() {
                "id" => meta.id = scalar(&value),
                "title" => meta.title = scalar(&value),
                "description" => meta.description = scalar(&value),
                "tags" => meta.tags = string_list(&value),
                "target_models" => meta.target_models = string_list(&value),
                "variables" => meta.variables = parse_variables(&value),
                "derived_from" => meta.derived_from = scalar(&value),
                "created" => meta.created = scalar(&value),
                "updated" => meta.updated = scalar(&value),
                _ => {
                    meta.extra.insert(key, value);
                }
            }
        }
        Ok(meta)
    }

    pub fn to_yaml(&self) -> String {
        fn put(m: &mut Mapping, key: &str, v: &Option<String>) {
            if let Some(s) = v.as_ref().filter(|s| !s.is_empty()) {
                m.insert(Value::String(key.into()), Value::String(s.clone()));
            }
        }
        fn put_list(m: &mut Mapping, key: &str, items: &[String]) {
            if !items.is_empty() {
                let seq = items.iter().map(|s| Value::String(s.clone())).collect();
                m.insert(Value::String(key.into()), Value::Sequence(seq));
            }
        }

        let mut m = Mapping::new();
        put(&mut m, "id", &self.id);
        put(&mut m, "title", &self.title);
        put(&mut m, "description", &self.description);
        put_list(&mut m, "tags", &self.tags);
        put_list(&mut m, "target_models", &self.target_models);
        if !self.variables.is_empty() {
            let seq = self
                .variables
                .iter()
                .map(|d| {
                    let mut vm = Mapping::new();
                    vm.insert(Value::String("name".into()), Value::String(d.name.clone()));
                    put(&mut vm, "label", &d.label);
                    put(&mut vm, "placeholder", &d.placeholder);
                    put(&mut vm, "default", &d.default);
                    Value::Mapping(vm)
                })
                .collect();
            m.insert(Value::String("variables".into()), Value::Sequence(seq));
        }
        put(&mut m, "derived_from", &self.derived_from);
        put(&mut m, "created", &self.created);
        put(&mut m, "updated", &self.updated);
        for (k, v) in &self.extra {
            m.insert(Value::String(k.clone()), v.clone());
        }
        if m.is_empty() {
            return String::new();
        }
        serde_yaml::to_string(&Value::Mapping(m)).unwrap_or_default()
    }
}

/// Split a prompt file into front matter and body.
pub fn parse(raw: &str) -> ParsedFile {
    let text = raw.strip_prefix('\u{feff}').unwrap_or(raw).replace("\r\n", "\n");

    if let Some(rest) = text.strip_prefix("---\n") {
        let mut offset = 0;
        for line in rest.split_inclusive('\n') {
            if line.trim_end() == "---" {
                let yaml = &rest[..offset];
                let after = &rest[offset + line.len()..];
                let body = after.strip_prefix('\n').unwrap_or(after).to_string();
                return match Meta::from_yaml(yaml) {
                    Ok(meta) => ParsedFile {
                        meta,
                        body,
                        warning: None,
                    },
                    Err(e) => ParsedFile {
                        meta: Meta::default(),
                        body: text.clone(),
                        warning: Some(format!("Could not read the front matter: {e}")),
                    },
                };
            }
            offset += line.len();
        }
    }

    ParsedFile {
        meta: Meta::default(),
        body: text,
        warning: None,
    }
}

/// Build the full file text: front matter, a blank line, then the body.
pub fn serialize(meta: &Meta, body: &str) -> String {
    let yaml = meta.to_yaml();
    let body = body.replace("\r\n", "\n");
    let mut out = String::new();
    if !yaml.is_empty() {
        out.push_str("---\n");
        out.push_str(&yaml);
        if !yaml.ends_with('\n') {
            out.push('\n');
        }
        out.push_str("---\n\n");
    }
    out.push_str(&body);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "---\nid: t-1\ntitle: Hello\ntags: [a, b]\nvariables:\n  - name: NICHE\n    label: Your niche\n    default: cooking\ncustom_key: 42\n---\n\nWrite about {{NICHE}}.\n";

    #[test]
    fn parses_front_matter_and_body() {
        let p = parse(SAMPLE);
        assert!(p.warning.is_none());
        assert_eq!(p.meta.id.as_deref(), Some("t-1"));
        assert_eq!(p.meta.title.as_deref(), Some("Hello"));
        assert_eq!(p.meta.tags, vec!["a", "b"]);
        assert_eq!(p.meta.variables[0].name, "NICHE");
        assert_eq!(p.meta.variables[0].default.as_deref(), Some("cooking"));
        assert_eq!(p.body, "Write about {{NICHE}}.\n");
        assert!(p.meta.extra.contains_key("custom_key"));
    }

    #[test]
    fn file_without_front_matter_is_all_body() {
        let p = parse("Just text\nmore\n");
        assert!(p.meta.id.is_none());
        assert_eq!(p.body, "Just text\nmore\n");
    }

    #[test]
    fn round_trip_keeps_meta_body_and_unknown_keys() {
        let p = parse(SAMPLE);
        let again = parse(&serialize(&p.meta, &p.body));
        assert_eq!(again.meta, p.meta);
        assert_eq!(again.body, p.body);
    }

    #[test]
    fn empty_body_round_trips() {
        let meta = Meta {
            id: Some("x".into()),
            title: Some("T".into()),
            ..Default::default()
        };
        let again = parse(&serialize(&meta, ""));
        assert_eq!(again.body, "");
        assert_eq!(again.meta.title.as_deref(), Some("T"));
    }

    #[test]
    fn broken_front_matter_keeps_whole_file_and_warns() {
        let raw = "---\ntitle: [unclosed\n---\nbody\n";
        let p = parse(raw);
        assert!(p.warning.is_some());
        assert_eq!(p.body, raw);
    }

    #[test]
    fn numbers_and_dates_become_strings() {
        let p = parse("---\ntitle: 2024\ncreated: 2026-11-05\n---\nx\n");
        assert_eq!(p.meta.title.as_deref(), Some("2024"));
        assert_eq!(p.meta.created.as_deref(), Some("2026-11-05"));
    }

    #[test]
    fn crlf_files_are_normalised() {
        let p = parse("---\r\ntitle: A\r\n---\r\n\r\nline1\r\nline2\r\n");
        assert_eq!(p.meta.title.as_deref(), Some("A"));
        assert_eq!(p.body, "line1\nline2\n");
    }
}
