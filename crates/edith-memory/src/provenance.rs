use edith_core::Provenance;
use regex::Regex;

use crate::error::{MemoryError, Result};

pub struct MemoryGatekeeper;

impl MemoryGatekeeper {
    /// Validates whether the memory text contains sensitive secrets or credentials.
    /// Under EDITH's Security Policy, sensitive credentials must never be written to memory.
    pub fn sanitize_and_check(content: &str) -> Result<()> {
        let trimmed = content.trim();
        if trimmed.is_empty() {
            return Err(MemoryError::Validation("Memory content cannot be empty".to_string()));
        }

        if trimmed.len() > 4096 {
            return Err(MemoryError::Validation("Memory content exceeds maximum length of 4096 characters".to_string()));
        }

        // Patterns detecting credentials / tokens / keys
        let secret_patterns = [
            r"(?i)bearer\s+[a-zA-Z0-9_\-\.]{16,}",
            r"ghp_[a-zA-Z0-9]{20,}",
            r"sk-[a-zA-Z0-9]{20,}",
            r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
            r"(?i)api[_\-]?key\s*[:=]\s*[a-zA-Z0-9_\-]{16,}",
            r"(?i)password\s*[:=]\s*\S{8,}",
        ];

        for pattern in &secret_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(trimmed) {
                    return Err(MemoryError::SecretDetected(
                        "Payload matched secret credential pattern".to_string(),
                    ));
                }
            }
        }

        Ok(())
    }

    /// Enforces confidence boundaries based on provenance rules (EDITH Memory Architecture §3).
    pub fn validate_confidence(provenance: Provenance, confidence: f32, user_confirmed: bool) -> f32 {
        if user_confirmed {
            return confidence.max(0.95).min(1.0);
        }

        match provenance {
            Provenance::Explicit => confidence.clamp(0.90, 1.0),
            Provenance::Inferred => {
                // Inferred facts start between 0.40 and 0.70, never above 0.80 without user confirmation
                confidence.clamp(0.40, 0.80)
            }
            Provenance::Assumption => confidence.clamp(0.10, 0.50),
            Provenance::Temporary => confidence.clamp(0.50, 1.0),
            Provenance::Outdated => confidence.clamp(0.0, 0.50),
        }
    }

    /// Determines whether a memory item may be stated to the owner as a firm fact without hedging.
    pub fn can_state_as_fact(provenance: Provenance, user_confirmed: bool) -> bool {
        if user_confirmed {
            return true;
        }
        matches!(provenance, Provenance::Explicit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_detection_rejects_api_keys() {
        assert!(MemoryGatekeeper::sanitize_and_check("Normal user preference: likes dark mode").is_ok());
        assert!(MemoryGatekeeper::sanitize_and_check("ghp_1234567890abcdef1234567890abcdef").is_err());
        assert!(MemoryGatekeeper::sanitize_and_check("Authorization: Bearer sk-1234567890abcdef1234567890").is_err());
        assert!(MemoryGatekeeper::sanitize_and_check("-----BEGIN PRIVATE KEY-----").is_err());
    }

    #[test]
    fn test_confidence_clamping() {
        // Inferred never exceeds 0.80 without confirmation
        let conf = MemoryGatekeeper::validate_confidence(Provenance::Inferred, 0.99, false);
        assert_eq!(conf, 0.80);

        // User confirmed raises to >= 0.95
        let conf_confirmed = MemoryGatekeeper::validate_confidence(Provenance::Inferred, 0.80, true);
        assert_eq!(conf_confirmed, 0.95);

        // Assumption capped at 0.50
        let conf_assump = MemoryGatekeeper::validate_confidence(Provenance::Assumption, 0.9, false);
        assert_eq!(conf_assump, 0.50);
    }

    #[test]
    fn test_can_state_as_fact() {
        assert!(MemoryGatekeeper::can_state_as_fact(Provenance::Explicit, false));
        assert!(!MemoryGatekeeper::can_state_as_fact(Provenance::Inferred, false));
        assert!(MemoryGatekeeper::can_state_as_fact(Provenance::Inferred, true));
        assert!(!MemoryGatekeeper::can_state_as_fact(Provenance::Assumption, false));
    }
}
