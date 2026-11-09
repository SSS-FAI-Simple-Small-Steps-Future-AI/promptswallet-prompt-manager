//! Per-user state stored beside the prompts: favorites, recents, last-used variable values.
//! It lives outside the built-in library, so built-in prompts can still be starred.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Result;

pub const MAX_RECENTS: usize = 20;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct UserState {
    pub favorites: Vec<String>,
    pub recents: Vec<String>,
    pub last_values: BTreeMap<String, String>,
}

impl UserState {
    /// A missing or unreadable file yields an empty state instead of an error.
    pub fn load(path: &Path) -> UserState {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let json = serde_json::to_string_pretty(self)?;
        crate::vault::write_atomic(path, &json)
    }

    pub fn toggle_favorite(&mut self, id: &str) -> bool {
        if let Some(pos) = self.favorites.iter().position(|f| f == id) {
            self.favorites.remove(pos);
            false
        } else {
            self.favorites.insert(0, id.to_string());
            true
        }
    }

    pub fn push_recent(&mut self, id: &str) {
        self.recents.retain(|r| r != id);
        self.recents.insert(0, id.to_string());
        self.recents.truncate(MAX_RECENTS);
    }
}
