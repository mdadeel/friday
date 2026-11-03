use crate::error::{Result, SearchError};
use crate::evidence::EvidenceVerifier;
use crate::extractor::ContentExtractor;
use crate::fetcher::SafeWebFetcher;
use crate::provider::{DuckDuckGoProvider, MockSearchProvider, SearchProvider};
use crate::types::{EvidenceSpan, FetchedDocument, SearchResult};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, warn};

pub struct SearchService {
    providers: Arc<RwLock<Vec<Arc<dyn SearchProvider>>>>,
    fetcher: Arc<SafeWebFetcher>,
}

impl Default for SearchService {
    fn default() -> Self {
        Self::new(vec![
            Arc::new(DuckDuckGoProvider::default()),
            Arc::new(MockSearchProvider::default()),
        ])
    }
}

impl SearchService {
    pub fn new(providers: Vec<Arc<dyn SearchProvider>>) -> Self {
        Self {
            providers: Arc::new(RwLock::new(providers)),
            fetcher: Arc::new(SafeWebFetcher::default()),
        }
    }

    pub async fn add_provider(&self, provider: Arc<dyn SearchProvider>) {
        self.providers.write().await.push(provider);
    }

    /// Search across providers with automatic fallback escalation.
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let providers = self.providers.read().await.clone();
        if providers.is_empty() {
            return Err(SearchError::ProviderUnavailable(
                "none".to_string(),
                "No search providers registered".to_string(),
            ));
        }

        let mut last_err = None;
        for provider in &providers {
            debug!("Attempting search with provider '{}'", provider.id());
            match provider.search(query, limit).await {
                Ok(results) if !results.is_empty() => return Ok(results),
                Ok(_) => {
                    debug!("Provider '{}' returned empty results, attempting fallback", provider.id());
                }
                Err(e) => {
                    warn!("Provider '{}' failed: {e}, attempting fallback", provider.id());
                    last_err = Some(e);
                }
            }
        }

        Err(last_err.unwrap_or_else(|| {
            SearchError::ProviderUnavailable(
                "all".to_string(),
                "All search providers returned empty results".to_string(),
            )
        }))
    }

    /// Safely fetches and parses a web page into clean markdown text with evidence blocks.
    pub async fn fetch(&self, url: &str) -> Result<FetchedDocument> {
        let (raw_html, status) = self.fetcher.fetch_raw(url).await?;
        let doc = ContentExtractor::extract(&raw_html, url, status);
        Ok(doc)
    }

    /// Extracts an evidence span from a document, verifying that the quote exists in the text.
    pub fn extract_evidence(
        &self,
        doc: &FetchedDocument,
        claim: impl Into<String>,
        quote: &str,
    ) -> Result<EvidenceSpan> {
        EvidenceVerifier::verify_span(doc, claim, quote)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_search_service_fallback_to_mock() {
        let service = SearchService::new(vec![Arc::new(MockSearchProvider::default())]);
        let results = service.search("Rust programming", 3).await.unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].rank, 1);
        assert!(results[0].title.contains("Rust programming"));
    }
}
