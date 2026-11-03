pub mod error;
pub mod evidence;
pub mod extractor;
pub mod fetcher;
pub mod provider;
pub mod service;
pub mod tools;
pub mod types;

pub use error::{Result, SearchError};
pub use evidence::EvidenceVerifier;
pub use extractor::ContentExtractor;
pub use fetcher::SafeWebFetcher;
pub use provider::{DuckDuckGoProvider, MockSearchProvider, SearchProvider};
pub use service::SearchService;
pub use tools::{WebFetchTool, WebSearchTool};
pub use types::{EvidenceBlock, EvidenceSpan, FetchedDocument, SearchResult};
