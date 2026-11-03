use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub provider: String,
    pub rank: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceBlock {
    pub id: String,
    pub index: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchedDocument {
    pub url: String,
    pub title: String,
    pub content: String,
    pub content_hash: String,
    pub status_code: u16,
    pub blocks: Vec<EvidenceBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceSpan {
    pub claim: String,
    pub span_id: String,
    pub quote: String,
    pub verified: bool,
}
