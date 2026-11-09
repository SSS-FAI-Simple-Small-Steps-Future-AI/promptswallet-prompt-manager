//! PromptVault core library: no UI, no Tauri. Everything here is unit-tested.

pub mod error;
pub mod guard;
pub mod library;
pub mod pack;
pub mod prompt;
pub mod slug;
pub mod state;
pub mod template;
pub mod vault;

pub use error::{Error, Result};
pub use guard::Roots;
pub use library::Scope;
pub use pack::{ExistingPackInfo, PackCategory, PackReport};
pub use prompt::VariableDef;
pub use state::UserState;
pub use vault::{
    CategoryNode, PackNode, PromptDetail, PromptSummary, PromptUpdate, SearchHit, Tree, Vault,
};
