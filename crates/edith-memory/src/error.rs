use thiserror::Error;

#[derive(Error, Debug)]
pub enum MemoryError {
    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Secret data detected in memory payload (rejected by security policy): {0}")]
    SecretDetected(String),

    #[error("Memory item '{0}' not found")]
    NotFound(String),

    #[error("Invalid provenance: {0}")]
    InvalidProvenance(String),
}

pub type Result<T> = std::result::Result<T, MemoryError>;
