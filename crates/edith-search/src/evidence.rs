use crate::error::{Result, SearchError};
use crate::types::{EvidenceSpan, FetchedDocument};

pub struct EvidenceVerifier;

impl EvidenceVerifier {
    /// Verifies that a quoted claim strictly exists inside the fetched document text.
    /// Returns an `EvidenceSpan` with verified = true and matching span ID if valid.
    pub fn verify_span(
        doc: &FetchedDocument,
        claim: impl Into<String>,
        quote: &str,
    ) -> Result<EvidenceSpan> {
        let trimmed_quote = quote.trim();
        if trimmed_quote.is_empty() {
            return Err(SearchError::EvidenceMismatch(
                "Evidence quote cannot be empty".to_string(),
            ));
        }

        // Verify quote exists as substring within doc.content
        if !doc.content.contains(trimmed_quote) {
            return Err(SearchError::EvidenceMismatch(format!(
                "Quote '{trimmed_quote}' does not exist in document from {}",
                doc.url
            )));
        }

        // Find matching block
        let matching_block = doc
            .blocks
            .iter()
            .find(|b| b.text.contains(trimmed_quote))
            .map(|b| b.id.clone())
            .unwrap_or_else(|| format!("{}:0", doc.content_hash.chars().take(12).collect::<String>()));

        Ok(EvidenceSpan {
            claim: claim.into(),
            span_id: matching_block,
            quote: trimmed_quote.to_string(),
            verified: true,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::extractor::ContentExtractor;

    #[test]
    fn test_verify_evidence_quote_matches() {
        let html = "<html><body><p>Rust guarantees memory safety without a garbage collector.</p></body></html>";
        let doc = ContentExtractor::extract(html, "https://rust-lang.org", 200);

        let quote = "memory safety without a garbage collector";
        let span = EvidenceVerifier::verify_span(&doc, "Rust is memory-safe without GC", quote).unwrap();

        assert!(span.verified);
        assert_eq!(span.quote, quote);
        assert!(!span.span_id.is_empty());
    }

    #[test]
    fn test_verify_evidence_quote_mismatch_fails() {
        let html = "<html><body><p>Rust guarantees memory safety without a garbage collector.</p></body></html>";
        let doc = ContentExtractor::extract(html, "https://rust-lang.org", 200);

        let fake_quote = "Python is faster than C++";
        let err = EvidenceVerifier::verify_span(&doc, "Speed comparison", fake_quote).unwrap_err();

        assert!(matches!(err, SearchError::EvidenceMismatch(_)));
    }
}
