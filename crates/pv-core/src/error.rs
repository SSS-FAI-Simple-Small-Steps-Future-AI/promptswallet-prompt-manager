use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Built-in prompts are read-only. Use \"Use as template\" to make an editable copy.")]
    ReadOnly,
    #[error("That location is outside your prompt workspace.")]
    OutsideWorkspace,
    #[error("Prompt not found: {0}")]
    NotFound(String),
    #[error("A file named \"{0}\" already exists there.")]
    AlreadyExists(String),
    #[error("{0}")]
    InvalidName(String),
    #[error("{0}")]
    Pack(String),
    #[error("File error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Could not write state file: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, Error>;
