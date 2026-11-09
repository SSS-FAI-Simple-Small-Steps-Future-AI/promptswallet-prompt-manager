//! Workspace roots and the read-only guard.
//!
//! Every write goes through [`Roots::ensure_writable`]. Built-in prompts live in a
//! separate directory (shipped with the app) and are refused here, so the rule holds
//! even if the UI is bypassed. Paths are canonicalised first, which defeats `..`
//! tricks and symlinks that point into the built-in library.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

#[derive(Debug, Clone)]
pub struct Roots {
    /// Read-only prompts shipped with the app.
    pub builtin: PathBuf,
    /// The user's writable workspace (e.g. `~/Documents/PromptVault`).
    pub workspace: PathBuf,
}

impl Roots {
    pub fn new(builtin: PathBuf, workspace: PathBuf) -> Result<Roots> {
        fs::create_dir_all(&workspace)?;
        let workspace = workspace.canonicalize()?;
        let builtin = builtin.canonicalize().unwrap_or(builtin);
        Ok(Roots { builtin, workspace })
    }

    /// Where user categories live: `<workspace>/My Prompts`.
    pub fn user_prompts(&self) -> PathBuf {
        self.workspace.join("My Prompts")
    }

    /// App metadata (favorites, recents, trash).
    pub fn state_dir(&self) -> PathBuf {
        self.workspace.join(".promptvault")
    }

    /// Imported prompt packs (shown in the Library, read-only): `<workspace>/.promptvault/library`.
    pub fn imported_dir(&self) -> PathBuf {
        self.state_dir().join("library")
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.state_dir().join("trash")
    }

    /// First run: create `My Prompts/Uncategorized` and a short README.
    /// An existing `My Prompts` folder is never touched, so deleted categories stay deleted.
    pub fn ensure_layout(&self) -> Result<()> {
        let mine = self.user_prompts();
        if !mine.exists() {
            fs::create_dir_all(mine.join("Uncategorized"))?;
            let readme = self.workspace.join("README.txt");
            if !readme.exists() {
                fs::write(
                    readme,
                    "PromptVault workspace\n\n\
                     My Prompts/<category>/<prompt>.md   your own prompts (plain Markdown files)\n\
                     .promptvault/                       app data (favorites, recents, trash)\n\n\
                     You can back up or sync this folder with any tool.\n",
                )?;
            }
        }
        fs::create_dir_all(self.state_dir())?;
        Ok(())
    }

    /// Returns the resolved path if `path` may be written, otherwise an error.
    /// `path` may be a file that does not exist yet (its parent must exist).
    pub fn ensure_writable(&self, path: &Path) -> Result<PathBuf> {
        let resolved = resolve(path)?;
        if resolved.starts_with(&self.builtin) {
            return Err(Error::ReadOnly);
        }
        let imported = self.imported_dir();
        let imported = imported.canonicalize().unwrap_or(imported);
        if resolved.starts_with(&imported) {
            return Err(Error::ReadOnly);
        }
        let mine = self.user_prompts();
        let mine = mine.canonicalize().unwrap_or(mine);
        if !resolved.starts_with(&mine) || resolved == mine {
            return Err(Error::OutsideWorkspace);
        }
        Ok(resolved)
    }
}

fn resolve(path: &Path) -> Result<PathBuf> {
    // symlink_metadata also sees dangling symlinks, which `exists()` reports as missing.
    if fs::symlink_metadata(path).is_ok() {
        return path.canonicalize().map_err(|_| Error::OutsideWorkspace);
    }
    let parent = path.parent().ok_or(Error::OutsideWorkspace)?;
    let name = path.file_name().ok_or(Error::OutsideWorkspace)?;
    let parent = parent.canonicalize().map_err(|_| Error::OutsideWorkspace)?;
    Ok(parent.join(name))
}
