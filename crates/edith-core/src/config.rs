use crate::error::{EdithError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdithConfig {
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub storage: StorageConfig,
    #[serde(default)]
    pub models: ModelsConfig,
    #[serde(default)]
    pub security: SecurityConfig,
}

impl Default for EdithConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            storage: StorageConfig::default(),
            models: ModelsConfig::default(),
            security: SecurityConfig::default(),
        }
    }
}

impl EdithConfig {
    pub fn load_from_str(s: &str) -> Result<Self> {
        toml::from_str(s).map_err(|e| EdithError::Config(format!("Failed to parse TOML: {e}")))
    }

    pub fn load_from_file(path: impl AsRef<Path>) -> Result<Self> {
        let content = std::fs::read_to_string(path)?;
        Self::load_from_str(&content)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_socket_path")]
    pub socket_path: PathBuf,
    #[serde(default = "default_tcp_host")]
    pub tcp_host: String,
    #[serde(default = "default_tcp_port")]
    pub tcp_port: u16,
    #[serde(default)]
    pub transport: TransportMode,
    #[serde(default)]
    pub auth_token: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportMode {
    Unix,
    Tcp,
    Both,
}

impl Default for TransportMode {
    fn default() -> Self {
        TransportMode::Both
    }
}

fn default_socket_path() -> PathBuf {
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        PathBuf::from(runtime_dir).join("edith").join("api.sock")
    } else {
        std::env::temp_dir().join("edith").join("api.sock")
    }
}

fn default_tcp_host() -> String {
    "127.0.0.1".to_string()
}

fn default_tcp_port() -> u16 {
    4242
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            socket_path: default_socket_path(),
            tcp_host: default_tcp_host(),
            tcp_port: default_tcp_port(),
            transport: TransportMode::default(),
            auth_token: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageConfig {
    #[serde(default = "default_db_path")]
    pub database_path: PathBuf,
    #[serde(default = "default_pool_size")]
    pub pool_size: u32,
}

fn default_db_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("edith")
            .join("edith.db")
    } else {
        PathBuf::from("edith.db")
    }
}

fn default_pool_size() -> u32 {
    4
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            database_path: default_db_path(),
            pool_size: default_pool_size(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsConfig {
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,
    #[serde(default = "default_tier1_model")]
    pub tier1_model: String,
    #[serde(default = "default_tier2_model")]
    pub tier2_model: String,
}

fn default_ollama_url() -> String {
    "http://127.0.0.1:11434".to_string()
}

fn default_tier1_model() -> String {
    "qwen3:0.6b".to_string()
}

fn default_tier2_model() -> String {
    "qwen3:4b".to_string()
}

impl Default for ModelsConfig {
    fn default() -> Self {
        Self {
            ollama_url: default_ollama_url(),
            tier1_model: default_tier1_model(),
            tier2_model: default_tier2_model(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    #[serde(default = "default_max_task_duration_secs")]
    pub max_task_duration_secs: u64,
}

fn default_max_task_duration_secs() -> u64 {
    300
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            max_task_duration_secs: default_max_task_duration_secs(),
        }
    }
}
