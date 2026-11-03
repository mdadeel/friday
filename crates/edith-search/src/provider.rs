use crate::error::{Result, SearchError};
use crate::types::SearchResult;
use async_trait::async_trait;
use regex::Regex;
use std::sync::Arc;
use tokio::sync::Mutex;

#[async_trait]
pub trait SearchProvider: Send + Sync {
    fn id(&self) -> &str;
    async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>>;
}

/// Mock search provider for deterministic automated testing and offline development.
pub struct MockSearchProvider {
    canned_results: Arc<Mutex<Vec<SearchResult>>>,
}

impl Default for MockSearchProvider {
    fn default() -> Self {
        Self {
            canned_results: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl MockSearchProvider {
    pub fn new(canned: Vec<SearchResult>) -> Self {
        Self {
            canned_results: Arc::new(Mutex::new(canned)),
        }
    }

    pub async fn add_result(&self, res: SearchResult) {
        self.canned_results.lock().await.push(res);
    }
}

#[async_trait]
impl SearchProvider for MockSearchProvider {
    fn id(&self) -> &str {
        "mock"
    }

    async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let canned = self.canned_results.lock().await;
        if !canned.is_empty() {
            let mut results = canned.clone();
            results.truncate(limit);
            return Ok(results);
        }

        // Return deterministic synthetic results for the query
        let results = vec![
            SearchResult {
                title: format!("{query} - Official Documentation"),
                url: format!("https://example.com/docs/{}", urlencoding::encode(query)),
                snippet: format!("Comprehensive guide, reference, and tutorials for {query}."),
                provider: "mock".to_string(),
                rank: 1,
            },
            SearchResult {
                title: format!("{query} - Architecture and Best Practices"),
                url: format!("https://example.org/articles/{}", urlencoding::encode(query)),
                snippet: format!("In-depth architectural overview and production best practices for {query}."),
                provider: "mock".to_string(),
                rank: 2,
            },
        ];

        let mut limited = results;
        limited.truncate(limit);
        Ok(limited)
    }
}

/// DuckDuckGo HTML search provider.
pub struct DuckDuckGoProvider {
    client: reqwest::Client,
}

impl Default for DuckDuckGoProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl DuckDuckGoProvider {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

#[async_trait]
impl SearchProvider for DuckDuckGoProvider {
    fn id(&self) -> &str {
        "duckduckgo"
    }

    async fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let encoded = urlencoding::encode(query);
        let url = format!("https://html.duckduckgo.com/html/?q={encoded}");

        let res = self
            .client
            .post(&url)
            .header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0")
            .header("Accept", "text/html")
            .send()
            .await
            .map_err(|e| SearchError::ProviderUnavailable("duckduckgo".to_string(), e.to_string()))?;

        if !res.status().is_success() {
            return Err(SearchError::ProviderUnavailable(
                "duckduckgo".to_string(),
                format!("HTTP {}", res.status()),
            ));
        }

        let html = res
            .text()
            .await
            .map_err(|e| SearchError::Network(format!("Failed to read DDG response: {e}")))?;

        let mut results = Vec::new();
        // Regex to parse DuckDuckGo HTML results: class="result__snippet" and class="result__url"
        let title_link_re = Regex::new(r#"<a[^>]+class="result__url"[^>]+href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap();
        let snippet_re = Regex::new(r#"<a[^>]+class="result__snippet"[^>]*>(.*?)</a>"#).unwrap();

        let links: Vec<(String, String)> = title_link_re
            .captures_iter(&html)
            .filter_map(|caps| {
                let href = caps.get(1)?.as_str().trim().to_string();
                let title = caps.get(2)?.as_str().trim().to_string();
                Some((href, title))
            })
            .collect();

        let snippets: Vec<String> = snippet_re
            .captures_iter(&html)
            .filter_map(|caps| Some(caps.get(1)?.as_str().trim().to_string()))
            .collect();

        for (i, (link, title)) in links.into_iter().enumerate() {
            if i >= limit {
                break;
            }
            let snippet = snippets.get(i).cloned().unwrap_or_default();
            results.push(SearchResult {
                title: strip_tags(&title),
                url: clean_ddg_url(&link),
                snippet: strip_tags(&snippet),
                provider: "duckduckgo".to_string(),
                rank: i + 1,
            });
        }

        Ok(results)
    }
}

fn strip_tags(html: &str) -> String {
    let re = Regex::new(r"<[^>]+>").unwrap();
    re.replace_all(html, " ").split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clean_ddg_url(raw: &str) -> String {
    if let Some(pos) = raw.find("uddg=") {
        let rest = &raw[pos + 5..];
        let end = rest.find('&').unwrap_or(rest.len());
        if let Ok(decoded) = urlencoding::decode(&rest[..end]) {
            return decoded.into_owned();
        }
    }
    raw.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_search_provider() {
        let provider = MockSearchProvider::default();
        let results = provider.search("Rust async Tokio", 5).await.unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].rank, 1);
        assert!(results[0].title.contains("Rust async Tokio"));
        assert!(results[0].url.contains("example.com"));
    }
}
