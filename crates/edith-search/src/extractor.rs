use crate::types::{EvidenceBlock, FetchedDocument};
use regex::Regex;
use sha2::{Digest, Sha256};

pub struct ContentExtractor;

impl ContentExtractor {
    /// Extracts readable text and structured evidence blocks from raw HTML.
    pub fn extract(raw_html: &str, url: &str, status_code: u16) -> FetchedDocument {
        let title = extract_title(raw_html);
        let cleaned = clean_html(raw_html);

        // Calculate SHA-256 content hash
        let mut hasher = Sha256::new();
        hasher.update(cleaned.as_bytes());
        let hash_full = format!("{:x}", hasher.finalize());
        let hash_short = hash_full.chars().take(12).collect::<String>();

        // Segment into evidence blocks (separated by empty lines)
        let blocks: Vec<EvidenceBlock> = cleaned
            .split("\n\n")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .enumerate()
            .map(|(idx, text)| EvidenceBlock {
                id: format!("{hash_short}:{idx}"),
                index: idx,
                text: text.to_string(),
            })
            .collect();

        FetchedDocument {
            url: url.to_string(),
            title,
            content: cleaned,
            content_hash: hash_full,
            status_code,
            blocks,
        }
    }
}

fn extract_title(html: &str) -> String {
    let re = Regex::new(r"(?i)<title[^>]*>(.*?)</title>").unwrap();
    if let Some(caps) = re.captures(html) {
        if let Some(m) = caps.get(1) {
            return decode_html_entities(m.as_str().trim());
        }
    }
    "Untitled Document".to_string()
}

fn clean_html(html: &str) -> String {
    let mut text = html.to_string();

    // 1. Remove comments
    let comment_re = Regex::new(r"(?s)<!--.*?-->").unwrap();
    text = comment_re.replace_all(&text, "").to_string();

    // 2. Remove script and style tags
    let script_re = Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    text = script_re.replace_all(&text, "").to_string();

    let style_re = Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    text = style_re.replace_all(&text, "").to_string();

    // 3. Remove head, nav, header, footer tags to keep main content
    let head_re = Regex::new(r"(?is)<head[^>]*>.*?</head>").unwrap();
    text = head_re.replace_all(&text, "").to_string();

    let nav_re = Regex::new(r"(?is)<nav[^>]*>.*?</nav>").unwrap();
    text = nav_re.replace_all(&text, "").to_string();

    let header_re = Regex::new(r"(?is)<header[^>]*>.*?</header>").unwrap();
    text = header_re.replace_all(&text, "").to_string();

    let footer_re = Regex::new(r"(?is)<footer[^>]*>.*?</footer>").unwrap();
    text = footer_re.replace_all(&text, "").to_string();

    // 4. Transform headings
    let h1_re = Regex::new(r"(?is)<h1[^>]*>(.*?)</h1>").unwrap();
    text = h1_re.replace_all(&text, "\n\n# $1\n\n").to_string();

    let h2_re = Regex::new(r"(?is)<h2[^>]*>(.*?)</h2>").unwrap();
    text = h2_re.replace_all(&text, "\n\n## $1\n\n").to_string();

    let h3_re = Regex::new(r"(?is)<h3[^>]*>(.*?)</h3>").unwrap();
    text = h3_re.replace_all(&text, "\n\n### $1\n\n").to_string();

    // 5. Transform paragraphs, list items, br
    let p_re = Regex::new(r"(?is)<p[^>]*>(.*?)</p>").unwrap();
    text = p_re.replace_all(&text, "\n\n$1\n\n").to_string();

    let li_re = Regex::new(r"(?is)<li[^>]*>(.*?)</li>").unwrap();
    text = li_re.replace_all(&text, "\n* $1").to_string();

    let br_re = Regex::new(r"(?i)<br\s*/?>").unwrap();
    text = br_re.replace_all(&text, "\n").to_string();

    // 6. Strip all other HTML tags
    let tag_re = Regex::new(r"<[^>]+>").unwrap();
    text = tag_re.replace_all(&text, " ").to_string();

    // 7. Decode HTML entities
    text = decode_html_entities(&text);

    // 8. Normalize spacing
    let lines: Vec<String> = text
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect();

    lines.join("\n\n")
}

fn decode_html_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_html_content_and_blocks() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head><title>Tokio Asynchronous Runtime</title></head>
            <body>
                <nav><a href="/">Home</a></nav>
                <main>
                    <h1>Tokio Overview</h1>
                    <p>Tokio is an asynchronous runtime for the Rust programming language.</p>
                    <p>It provides the building blocks needed for writing networked applications.</p>
                </main>
                <footer>Copyright 2026</footer>
            </body>
            </html>
        "#;

        let doc = ContentExtractor::extract(html, "https://tokio.rs", 200);
        assert_eq!(doc.title, "Tokio Asynchronous Runtime");
        assert!(doc.content.contains("# Tokio Overview"));
        assert!(doc.content.contains("Tokio is an asynchronous runtime"));
        assert!(!doc.content.contains("Home")); // nav stripped
        assert!(!doc.content.contains("Copyright 2026")); // footer stripped
        assert!(!doc.content_hash.is_empty());
        assert_eq!(doc.blocks.len(), 3);
        assert!(doc.blocks[0].text.contains("Tokio Overview"));
    }
}
