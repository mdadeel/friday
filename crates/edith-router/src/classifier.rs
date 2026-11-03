use edith_core::Tier;

#[derive(Debug, Clone, PartialEq)]
pub struct ClassificationResult {
    pub tier: Tier,
    pub complexity: f32,
    pub estimated_tokens: u32,
    pub rationale: &'static str,
}

pub struct ComplexityClassifier;

impl ComplexityClassifier {
    pub fn classify(prompt: &str, history_turns_count: usize) -> ClassificationResult {
        let trimmed = prompt.trim();
        let char_len = trimmed.len();
        let estimated_prompt_tokens = (char_len / 4).max(1) as u32;

        let lower = trimmed.to_lowercase();

        // 1. Check for Tier 4 indicators (Frontier Cloud: complex architecture, security audit, formal proofs)
        if lower.contains("security audit")
            || lower.contains("penetration test")
            || lower.contains("formal verification")
            || lower.contains("architecture synthesis")
            || lower.contains("threat model")
        {
            return ClassificationResult {
                tier: Tier::T4,
                complexity: 0.95,
                estimated_tokens: estimated_prompt_tokens + 2048,
                rationale: "Requires frontier reasoning for security or high-assurance architectural synthesis",
            };
        }

        // 2. Check for Tier 3 indicators (Workhorse Cloud: deep code generation, refactoring, large documents)
        if lower.contains("refactor")
            || lower.contains("rewrite")
            || lower.contains("implement full")
            || lower.contains("multi-file")
            || estimated_prompt_tokens > 1500
        {
            return ClassificationResult {
                tier: Tier::T3,
                complexity: 0.75,
                estimated_tokens: estimated_prompt_tokens + 1024,
                rationale: "Requires large context or deep code generation suitable for workhorse cloud model",
            };
        }

        // 3. Check for Tier 2 indicators (Reasoning Local: multi-step planning, coding, logic puzzle, structured tool call)
        if lower.contains("plan")
            || lower.contains("steps")
            || lower.contains("build")
            || lower.contains("debug")
            || lower.contains("code")
            || lower.contains("function")
            || lower.contains("why")
            || lower.contains("explain")
            || history_turns_count > 6
        {
            return ClassificationResult {
                tier: Tier::T2,
                complexity: 0.50,
                estimated_tokens: estimated_prompt_tokens + 512,
                rationale: "Requires local reasoning model for planning, explanation, or structured execution",
            };
        }

        // 4. Default: Tier 1 (Fast Local: greetings, short questions, light conversation)
        ClassificationResult {
            tier: Tier::T1,
            complexity: 0.20,
            estimated_tokens: estimated_prompt_tokens + 128,
            rationale: "Short prompt suitable for fast local inference",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tier1_fast_local_classification() {
        let res = ComplexityClassifier::classify("hello edith", 0);
        assert_eq!(res.tier, Tier::T1);
        assert!(res.complexity <= 0.3);
    }

    #[test]
    fn test_tier2_reasoning_local_classification() {
        let res = ComplexityClassifier::classify("Why is the sky blue?", 0);
        assert_eq!(res.tier, Tier::T2);

        let res = ComplexityClassifier::classify("Plan and build the steps for deployment", 0);
        assert_eq!(res.tier, Tier::T2);
    }

    #[test]
    fn test_tier3_workhorse_cloud_classification() {
        let res = ComplexityClassifier::classify("Please refactor this entire module across crates", 0);
        assert_eq!(res.tier, Tier::T3);
    }

    #[test]
    fn test_tier4_frontier_cloud_classification() {
        let res = ComplexityClassifier::classify("Perform a security audit and threat model on our auth flow", 0);
        assert_eq!(res.tier, Tier::T4);
    }
}
