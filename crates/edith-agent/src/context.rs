use chrono::Utc;
use edith_models::ChatMessage;
use edith_storage::TurnRecord;

pub struct ContextBuilder {
    system_prompt: String,
    working_context: Option<String>,
    tools_prompt: Option<String>,
    max_tokens: usize,
}

impl ContextBuilder {
    pub fn new() -> Self {
        let now = Utc::now().to_rfc3339();
        let default_system = format!(
            "You are EDITH, an advanced AI personal assistant operating as an intelligent, autonomous, and proactive digital partner.\n\
             Current time: {}\n\
             Tone: concise, direct, helpful, and technically precise.\n\
             Grounding & Anti-Hallucination Rules:\n\
             1. Never hallucinate or guess file contents, repository structure, or external facts.\n\
             2. When answering questions about code, files, or recent information, rely exclusively on executed tool observations and verified context.\n\
             3. If an answer requires accessing the workspace, ask or use available tools (fs.list_dir, fs.read_file, web.search).\n\
             4. Use code blocks with appropriate language tags for code snippets.\n\
             5. Keep answers honest, concise, and grounded.",
            now
        );

        Self {
            system_prompt: default_system,
            working_context: None,
            tools_prompt: None,
            max_tokens: 8192,
        }
    }

    pub fn with_system_prompt(mut self, prompt: impl Into<String>) -> Self {
        self.system_prompt = prompt.into();
        self
    }

    pub fn with_working_context(mut self, context: impl Into<String>) -> Self {
        self.working_context = Some(context.into());
        self
    }

    pub fn with_tools_prompt(mut self, tools_spec: impl Into<String>) -> Self {
        self.tools_prompt = Some(tools_spec.into());
        self
    }

    pub fn with_max_tokens(mut self, max: usize) -> Self {
        self.max_tokens = max;
        self
    }

    /// Assembles chat messages from historical turns, fitting within `max_tokens` estimate.
    pub fn build(&self, history: &[TurnRecord]) -> Vec<ChatMessage> {
        let mut messages = Vec::new();

        // 1. Build composite system prompt
        let mut full_system = self.system_prompt.clone();
        if let Some(ref tools) = self.tools_prompt {
            full_system.push_str("\n\n### Available Tools & Capabilities:\n");
            full_system.push_str(tools);
        }
        if let Some(ref working) = self.working_context {
            full_system.push_str("\n\n### Working Context & Scratchpad:\n");
            full_system.push_str(working);
        }

        messages.push(ChatMessage::system(full_system));

        // 2. Budget token estimation (approx 4 chars per token)
        let system_tokens = messages[0].content.len() / 4;
        let mut remaining_budget = if self.max_tokens > system_tokens {
            self.max_tokens - system_tokens
        } else {
            500
        };

        // 3. Collect history turns backwards to preserve the most recent context
        let mut turns_to_include = Vec::new();
        for turn in history.iter().rev() {
            let turn_tokens = turn.content.len() / 4;
            if turn_tokens > remaining_budget && !turns_to_include.is_empty() {
                break; // Stop taking older turns if budget exceeded
            }
            remaining_budget = remaining_budget.saturating_sub(turn_tokens);
            turns_to_include.push(turn);
        }

        // 4. Reverse back to chronological order and append
        turns_to_include.reverse();
        for turn in turns_to_include {
            match turn.role.as_str() {
                "user" => messages.push(ChatMessage::user(&turn.content)),
                "assistant" => messages.push(ChatMessage::assistant(&turn.content)),
                "system" => messages.push(ChatMessage::system(&turn.content)),
                _ => messages.push(ChatMessage::user(&turn.content)),
            }
        }

        messages
    }
}

impl Default for ContextBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_builder_assembly() {
        let builder = ContextBuilder::new()
            .with_working_context("Active file: src/main.rs")
            .with_tools_prompt("- fs.read: Read file contents");

        let turns = vec![
            TurnRecord {
                id: "1".into(),
                session_id: "s1".into(),
                role: "user".into(),
                content: "Can you inspect main.rs?".into(),
                thinking: None,
                route_id: None,
                created_at: "2026-11-03T00:00:00Z".into(),
            },
            TurnRecord {
                id: "2".into(),
                session_id: "s1".into(),
                role: "assistant".into(),
                content: "I will read the file.".into(),
                thinking: None,
                route_id: None,
                created_at: "2026-11-03T00:00:01Z".into(),
            },
        ];

        let messages = builder.build(&turns);
        assert_eq!(messages.len(), 3);
        assert!(messages[0].content.contains("Available Tools"));
        assert!(messages[0].content.contains("Working Context"));
        assert_eq!(messages[1].content, "Can you inspect main.rs?");
        assert_eq!(messages[2].content, "I will read the file.");
    }
}
