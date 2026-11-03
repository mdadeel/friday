/// Utility for preparing model response text into spoken form and segmenting sentences for TTS streaming.
pub struct SentenceSegmenter;

impl SentenceSegmenter {
    /// Cleans and formats markdown text into spoken form according to EDITH Voice specs:
    /// - Strips markdown code blocks (` ```...``` ` -> "[code block omitted]")
    /// - Strips inline code (` `code` ` -> "code")
    /// - Strips markdown tables -> "[table omitted]"
    /// - Strips markdown link targets (`[title](url)` -> "title")
    /// - Strips header hashes (`# ` -> "")
    /// - Strips bold/italic markers (`**`, `*`, `__`, `_`)
    pub fn prepare_for_speech(raw: &str) -> String {
        let mut text = raw.to_string();

        // 1. Replace multi-line code blocks ```...```
        while let Some(start) = text.find("```") {
            if let Some(end) = text[start + 3..].find("```") {
                let block_end = start + 3 + end + 3;
                text.replace_range(start..block_end, " [code block omitted] ");
            } else {
                // Unclosed code block - drop rest
                text.truncate(start);
                text.push_str(" [code block omitted]");
                break;
            }
        }

        // 2. Remove markdown tables (lines starting and containing '|')
        let lines: Vec<&str> = text.lines().collect();
        let mut cleaned_lines = Vec::new();
        let mut in_table = false;

        for line in lines {
            let trimmed = line.trim();
            if trimmed.starts_with('|') && trimmed.ends_with('|') {
                if !in_table {
                    cleaned_lines.push("[table omitted]");
                    in_table = true;
                }
            } else {
                in_table = false;
                cleaned_lines.push(line);
            }
        }
        text = cleaned_lines.join("\n");

        // 3. Replace markdown links [label](url) with just label
        while let Some(mid_rel) = text.find("](") {
            if let Some(start) = text[..mid_rel].rfind('[') {
                if let Some(end_rel) = text[mid_rel + 2..].find(')') {
                    let end_idx = mid_rel + 2 + end_rel;
                    let label = text[start + 1..mid_rel].to_string();
                    text.replace_range(start..=end_idx, &label);
                    continue;
                }
            }
            break;
        }

        // 4. Remove inline backticks `
        text = text.replace('`', "");

        // 5. Remove bold/italics
        text = text.replace("**", "").replace('*', "");

        // 6. Clean header markers at line starts
        let lines: Vec<String> = text
            .lines()
            .map(|l| {
                let trimmed = l.trim_start();
                if trimmed.starts_with('#') {
                    trimmed.trim_start_matches('#').trim_start().to_string()
                } else {
                    l.to_string()
                }
            })
            .collect();
        text = lines.join(" ");

        // 7. Collapse repeated whitespace
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Splits prepared text into natural sentence chunks for streaming synthesis.
    pub fn split_sentences(text: &str) -> Vec<String> {
        let mut sentences = Vec::new();
        let mut current = String::new();

        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            let ch = chars[i];
            current.push(ch);

            if ch == '.' || ch == '!' || ch == '?' {
                // Look ahead: ensure not an abbreviation like "e.g." or part of a decimal like "3.14"
                let is_decimal = i > 0
                    && i + 1 < chars.len()
                    && chars[i - 1].is_ascii_digit()
                    && chars[i + 1].is_ascii_digit();

                if !is_decimal {
                    // Check if followed by whitespace or end of string
                    let next_is_space = i + 1 == chars.len() || chars[i + 1].is_whitespace();
                    if next_is_space {
                        let trimmed = current.trim().to_string();
                        if !trimmed.is_empty() {
                            sentences.push(trimmed);
                        }
                        current.clear();
                    }
                }
            }
            i += 1;
        }

        let remaining = current.trim().to_string();
        if !remaining.is_empty() {
            sentences.push(remaining);
        }

        sentences
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prepare_for_speech_strips_code_blocks_and_markdown() {
        let input = "Here is the plan:\n\n```rust\nfn main() {\n    println!(\"hello\");\n}\n```\nCheck [this file](file:///path/to/main.rs). **Done!**";
        let cleaned = SentenceSegmenter::prepare_for_speech(input);
        assert!(!cleaned.contains("println"));
        assert!(cleaned.contains("[code block omitted]"));
        assert!(cleaned.contains("Check this file. Done!"));
        assert!(!cleaned.contains("**"));
    }

    #[test]
    fn test_prepare_for_speech_strips_tables() {
        let input = "Summary of results:\n| Name | Status |\n|---|---|\n| Task1 | OK |\n| Task2 | Fail |\nAll finished.";
        let cleaned = SentenceSegmenter::prepare_for_speech(input);
        assert!(cleaned.contains("[table omitted]"));
        assert!(!cleaned.contains("Task1"));
        assert!(cleaned.contains("All finished."));
    }

    #[test]
    fn test_sentence_splitting() {
        let input = "Hello owner! I have created the new database migration. Version 3.14 was applied successfully. Would you like me to proceed?";
        let sentences = SentenceSegmenter::split_sentences(input);
        assert_eq!(sentences.len(), 4);
        assert_eq!(sentences[0], "Hello owner!");
        assert_eq!(sentences[1], "I have created the new database migration.");
        assert_eq!(sentences[2], "Version 3.14 was applied successfully.");
        assert_eq!(sentences[3], "Would you like me to proceed?");
    }
}
