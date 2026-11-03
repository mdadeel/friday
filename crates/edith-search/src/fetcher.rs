use crate::error::{Result, SearchError};
use std::net::{Ipv4Addr, Ipv6Addr};
use std::time::Duration;
use url::Url;

pub struct SafeWebFetcher {
    client: reqwest::Client,
    max_body_bytes: usize,
}

impl Default for SafeWebFetcher {
    fn default() -> Self {
        Self::new(5 * 1024 * 1024) // 5 MB limit per Arena specs §3.4
    }
}

impl SafeWebFetcher {
    pub fn new(max_body_bytes: usize) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_default();

        Self {
            client,
            max_body_bytes,
        }
    }

    /// Validates the target URL to ensure safe external retrieval and block SSRF attacks.
    pub fn validate_url(&self, raw_url: &str) -> Result<Url> {
        let parsed = Url::parse(raw_url).map_err(|e| SearchError::InvalidUrl(e.to_string()))?;

        // 1. Only http and https permitted
        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(SearchError::InvalidUrl(format!(
                "Unsupported scheme '{}': only http and https are allowed",
                parsed.scheme()
            )));
        }

        // 2. Prohibit loopback / private IP / localhost targets
        match parsed.host() {
            Some(url::Host::Domain(domain)) => {
                let domain_lower = domain.to_lowercase();
                if domain_lower == "localhost"
                    || domain_lower.ends_with(".localhost")
                    || domain_lower.ends_with(".local")
                    || domain_lower.ends_with(".internal")
                {
                    return Err(SearchError::SsrfBlocked(format!(
                        "Domain '{domain}' is prohibited by SSRF policy"
                    )));
                }
            }
            Some(url::Host::Ipv4(ipv4)) => {
                if is_private_or_local_ipv4(ipv4) {
                    return Err(SearchError::SsrfBlocked(format!(
                        "IPv4 address '{ipv4}' is in a private/local range"
                    )));
                }
            }
            Some(url::Host::Ipv6(ipv6)) => {
                if is_private_or_local_ipv6(ipv6) {
                    return Err(SearchError::SsrfBlocked(format!(
                        "IPv6 address '{ipv6}' is in a private/local range"
                    )));
                }
            }
            None => {
                return Err(SearchError::InvalidUrl("Missing host in URL".to_string()));
            }
        }

        Ok(parsed)
    }

    /// Fetches the raw HTML content of the target URL safely.
    pub async fn fetch_raw(&self, raw_url: &str) -> Result<(String, u16)> {
        let url = self.validate_url(raw_url)?;

        let response = self
            .client
            .get(url.as_str())
            .header("User-Agent", "EDITH-Research-Bot/2.0 (+https://github.com/mdadeel/friday)")
            .header("Accept", "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8")
            .send()
            .await
            .map_err(|e| SearchError::Network(format!("HTTP request failed: {e}")))?;

        let status = response.status().as_u16();

        // Check Content-Length header if present
        if let Some(len) = response.content_length() {
            if len as usize > self.max_body_bytes {
                return Err(SearchError::ContentTooLarge {
                    size: len as usize,
                    limit: self.max_body_bytes,
                });
            }
        }

        let body_bytes = response
            .bytes()
            .await
            .map_err(|e| SearchError::Network(format!("Failed to read response body: {e}")))?;

        if body_bytes.len() > self.max_body_bytes {
            return Err(SearchError::ContentTooLarge {
                size: body_bytes.len(),
                limit: self.max_body_bytes,
            });
        }

        let body_str = String::from_utf8_lossy(&body_bytes).to_string();
        Ok((body_str, status))
    }
}

fn is_private_or_local_ipv4(ipv4: Ipv4Addr) -> bool {
    ipv4.is_loopback()
        || ipv4.is_private()
        || ipv4.is_link_local()
        || ipv4.is_broadcast()
        || ipv4.is_documentation()
        || ipv4 == Ipv4Addr::new(0, 0, 0, 0)
}

fn is_private_or_local_ipv6(ipv6: Ipv6Addr) -> bool {
    ipv6.is_loopback()
        || (ipv6.segments()[0] & 0xfe00) == 0xfc00 // Unique local address (fc00::/7)
        || (ipv6.segments()[0] & 0xffc0) == 0xfe80 // Link-local address (fe80::/10)
        || ipv6 == Ipv6Addr::UNSPECIFIED
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ssrf_blocking_prohibits_private_ips_and_localhost() {
        let fetcher = SafeWebFetcher::default();

        assert!(fetcher.validate_url("http://localhost:8080/secret").is_err());
        assert!(fetcher.validate_url("http://127.0.0.1:4242/v1/status").is_err());
        assert!(fetcher.validate_url("http://192.168.1.1/admin").is_err());
        assert!(fetcher.validate_url("http://10.0.0.1/internal").is_err());
        assert!(fetcher.validate_url("http://172.16.0.5/api").is_err());
        assert!(fetcher.validate_url("http://[::1]/root").is_err());
        assert!(fetcher.validate_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn test_valid_urls_pass_validation() {
        let fetcher = SafeWebFetcher::default();

        assert!(fetcher.validate_url("https://www.rust-lang.org").is_ok());
        assert!(fetcher.validate_url("https://crates.io/crates/tokio").is_ok());
        assert!(fetcher.validate_url("http://example.com/docs").is_ok());
    }
}
