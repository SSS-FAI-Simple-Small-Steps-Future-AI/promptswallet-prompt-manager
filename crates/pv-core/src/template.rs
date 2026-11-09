//! `{{VARIABLE}}` placeholders: detection and substitution.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;

use crate::prompt::VariableDef;

static VAR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{\s*([\p{L}\p{N}_]+)\s*\}\}").expect("valid regex"));

/// Variable names in order of first appearance, without duplicates.
pub fn extract_variables(body: &str) -> Vec<String> {
    let mut seen: Vec<String> = Vec::new();
    for cap in VAR_RE.captures_iter(body) {
        let name = cap[1].to_string();
        if !seen.contains(&name) {
            seen.push(name);
        }
    }
    seen
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rendered {
    pub text: String,
    /// Variables that were missing or blank; their `{{NAME}}` token is left in place.
    pub unfilled: Vec<String>,
}

pub fn render(body: &str, values: &BTreeMap<String, String>) -> Rendered {
    let mut unfilled: Vec<String> = Vec::new();
    let text = VAR_RE
        .replace_all(body, |caps: &regex::Captures| {
            let name = &caps[1];
            match values.get(name).filter(|v| !v.trim().is_empty()) {
                Some(v) => v.clone(),
                None => {
                    if !unfilled.iter().any(|n| n == name) {
                        unfilled.push(name.to_string());
                    }
                    caps[0].to_string()
                }
            }
        })
        .into_owned();
    Rendered { text, unfilled }
}

fn clean(v: &Option<String>) -> Option<String> {
    v.as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// One definition per variable found in the body, in body order.
/// Variables without a declaration get a bare `{ name }` entry.
pub fn merge_variables(declared: &[VariableDef], body: &str) -> Vec<VariableDef> {
    extract_variables(body)
        .into_iter()
        .map(|name| {
            declared
                .iter()
                .find(|d| d.name == name)
                .cloned()
                .unwrap_or(VariableDef {
                    name,
                    ..Default::default()
                })
        })
        .collect()
}

/// What gets written to front matter: only variables that still appear in the body
/// and that carry at least a label, placeholder or default.
pub fn normalize_defs(body: &str, defs: &[VariableDef]) -> Vec<VariableDef> {
    merge_variables(defs, body)
        .into_iter()
        .map(|d| VariableDef {
            name: d.name,
            label: clean(&d.label),
            placeholder: clean(&d.placeholder),
            default: clean(&d.default),
        })
        .filter(|d| d.label.is_some() || d.placeholder.is_some() || d.default.is_some())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vals(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn extracts_in_order_without_duplicates() {
        let v = extract_variables("{{B}} and {{ A }} and {{B}} and {{ C_1 }}");
        assert_eq!(v, vec!["B", "A", "C_1"]);
    }

    #[test]
    fn ignores_single_braces_and_brackets() {
        assert!(extract_variables("[NICHE] {NICHE} {{ }} {{a-b}}").is_empty());
    }

    #[test]
    fn supports_unicode_names() {
        assert_eq!(extract_variables("{{موضوع}} x"), vec!["موضوع"]);
    }

    #[test]
    fn renders_values_and_reports_unfilled() {
        let r = render("Hi {{NAME}}, welcome to {{PLACE}}.", &vals(&[("NAME", "Sam")]));
        assert_eq!(r.text, "Hi Sam, welcome to {{PLACE}}.");
        assert_eq!(r.unfilled, vec!["PLACE"]);
    }

    #[test]
    fn blank_values_count_as_unfilled() {
        let r = render("{{A}}", &vals(&[("A", "   ")]));
        assert_eq!(r.text, "{{A}}");
        assert_eq!(r.unfilled, vec!["A"]);
    }

    #[test]
    fn dollar_signs_in_values_are_literal() {
        let r = render("Price: {{P}}", &vals(&[("P", "$5 and $1")]));
        assert_eq!(r.text, "Price: $5 and $1");
    }

    #[test]
    fn repeated_variable_is_replaced_everywhere() {
        let r = render("{{A}}-{{A}}", &vals(&[("A", "x")]));
        assert_eq!(r.text, "x-x");
    }

    #[test]
    fn normalize_drops_stale_and_empty_defs() {
        let defs = vec![
            VariableDef {
                name: "A".into(),
                label: Some(" Topic ".into()),
                ..Default::default()
            },
            VariableDef {
                name: "GONE".into(),
                label: Some("x".into()),
                ..Default::default()
            },
            VariableDef {
                name: "B".into(),
                label: Some("  ".into()),
                ..Default::default()
            },
        ];
        let out = normalize_defs("{{A}} {{B}}", &defs);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "A");
        assert_eq!(out[0].label.as_deref(), Some("Topic"));
    }

    #[test]
    fn merge_adds_bare_entries_for_undeclared() {
        let out = merge_variables(&[], "{{X}} {{Y}}");
        assert_eq!(out.iter().map(|d| d.name.as_str()).collect::<Vec<_>>(), ["X", "Y"]);
    }
}
