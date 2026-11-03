use thiserror::Error;

#[derive(Error, Debug)]
pub enum McpError {
    #[error("MCP Server '{0}' not found")]
    ServerNotFound(String),

    #[error("Transport error: {0}")]
    Transport(String),

    #[error("Protocol error: {0}")]
    Protocol(String),

    #[error("Tool call error: {0}")]
    ToolCall(String),

    #[error("JSON-RPC error: code {code}, message: {message}")]
    JsonRpc { code: i64, message: String },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, McpError>;
