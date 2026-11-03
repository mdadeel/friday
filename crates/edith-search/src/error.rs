use thiserror::Error;

#[derive(Debug, Error)]
pub enum SearchError {
    #[error("Network error: {0}")]
    Network(String),

    #[error("Search provider '{0}' is unavailable: {1}")]
    ProviderUnavailable(String, String),

    #[error("Rate limited by search provider '{0}': {1}")]
    RateLimited(String, String),

    #[error("Invalid URL: {0}")]
    InvalidUrl(String),

    #[error("SSRF policy blocked access to prohibited/private host: {0}")]
    SsrfBlocked(String),

    #[error("Document size {size} bytes exceeds maximum limit of {limit} bytes")]
    ContentTooLarge { size: usize, limit: usize },

    #[error("Content extraction failed: {0}")]
    ExtractionFailed(String),

    #[error("Evidence quote mismatch: quote does not exist in source document")]
    EvidenceMismatch(String),

    #[error("Internal search error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, SearchError>;
