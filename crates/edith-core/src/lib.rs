pub mod config;
pub mod error;
pub mod id;
pub mod types;

pub use config::EdithConfig;
pub use error::{EdithError, Result};
pub use id::Id;
pub use types::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_id_creation_and_serialization() {
        let id = Id::new();
        assert!(!id.as_str().is_empty());
        let json = serde_json::to_string(&id).unwrap();
        let deserialized: Id = serde_json::from_str(&json).unwrap();
        assert_eq!(id, deserialized);
    }

    #[test]
    fn test_task_state_serialization() {
        let state = TaskState::WaitingApproval;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"waiting_approval\"");
        let deserialized: TaskState = serde_json::from_str(&json).unwrap();
        assert_eq!(state, deserialized);
    }

    #[test]
    fn test_default_config_parsing() {
        let toml_str = r#"
[server]
tcp_port = 8080
transport = "tcp"

[models]
tier1_model = "qwen2.5:0.5b"
"#;
        let config = EdithConfig::load_from_str(toml_str).unwrap();
        assert_eq!(config.server.tcp_port, 8080);
        assert_eq!(config.server.transport, config::TransportMode::Tcp);
        assert_eq!(config.models.tier1_model, "qwen2.5:0.5b");
        assert_eq!(config.models.tier2_model, "qwen3:4b");
    }
}
