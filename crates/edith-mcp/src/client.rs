use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

use crate::error::{McpError, Result};
use crate::protocol::{
    ClientInfo, InitializeParams, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse,
    McpToolDefinition, ToolCallResult,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServerStatus {
    Configured,
    Starting,
    Ready,
    Degraded,
    Stopped,
    Unavailable(String),
}

#[derive(Debug, Clone)]
pub struct McpServerConfig {
    pub id: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub enabled: bool,
}

pub struct StdioMcpClient {
    config: McpServerConfig,
    status: ServerStatus,
    child: Option<Child>,
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    reader: Option<Arc<Mutex<BufReader<ChildStdout>>>>,
    request_id: AtomicI64,
}

impl StdioMcpClient {
    pub fn new(config: McpServerConfig) -> Self {
        Self {
            config,
            status: ServerStatus::Configured,
            child: None,
            stdin: None,
            reader: None,
            request_id: AtomicI64::new(1),
        }
    }

    pub fn status(&self) -> &ServerStatus {
        &self.status
    }

    pub fn server_id(&self) -> &str {
        &self.config.id
    }

    /// Launch child process and perform initialize handshake.
    pub async fn start(&mut self) -> Result<()> {
        if self.status == ServerStatus::Ready {
            return Ok(());
        }

        self.status = ServerStatus::Starting;
        tracing::info!(server_id = %self.config.id, command = %self.config.command, "Starting MCP server");

        let mut cmd = Command::new(&self.config.command);
        cmd.args(&self.config.args);
        cmd.envs(&self.config.env);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::inherit());

        let mut child = cmd.spawn().map_err(|e| {
            let err_msg = format!("Failed to spawn MCP server '{}': {}", self.config.id, e);
            self.status = ServerStatus::Unavailable(err_msg.clone());
            McpError::Transport(err_msg)
        })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            McpError::Transport("Failed to capture MCP server stdin".to_string())
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            McpError::Transport("Failed to capture MCP server stdout".to_string())
        })?;

        let stdin_arc = Arc::new(Mutex::new(stdin));
        let reader_arc = Arc::new(Mutex::new(BufReader::new(stdout)));

        self.child = Some(child);
        self.stdin = Some(stdin_arc);
        self.reader = Some(reader_arc);

        // Perform initialize handshake
        let init_params = InitializeParams {
            protocol_version: "2024-11-05".to_string(),
            capabilities: json!({
                "roots": { "listChanged": true }
            }),
            client_info: ClientInfo {
                name: "edith".to_string(),
                version: "0.1.0".to_string(),
            },
        };

        let init_res = self
            .send_request("initialize", Some(serde_json::to_value(init_params)?))
            .await?;

        tracing::info!(server_id = %self.config.id, init_response = ?init_res, "MCP server initialized");

        // Send notifications/initialized
        self.send_notification("notifications/initialized", None).await?;

        self.status = ServerStatus::Ready;
        Ok(())
    }

    /// List tools advertised by the server.
    pub async fn list_tools(&self) -> Result<Vec<McpToolDefinition>> {
        let res = self.send_request("tools/list", Some(json!({}))).await?;
        let tools_val = res
            .get("tools")
            .ok_or_else(|| McpError::Protocol("Missing 'tools' field in tools/list response".to_string()))?;

        let tools: Vec<McpToolDefinition> = serde_json::from_value(tools_val.clone())?;
        Ok(tools)
    }

    /// Invoke a tool on the server.
    pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<Value> {
        let params = json!({
            "name": name,
            "arguments": arguments
        });

        let res = self.send_request("tools/call", Some(params)).await?;
        let tool_call_result: ToolCallResult = serde_json::from_value(res)?;

        if tool_call_result.is_error {
            let error_text = tool_call_result
                .content
                .into_iter()
                .filter_map(|c| c.text)
                .collect::<Vec<_>>()
                .join("\n");
            return Err(McpError::ToolCall(error_text));
        }

        let output_text = tool_call_result
            .content
            .into_iter()
            .filter_map(|c| c.text)
            .collect::<Vec<_>>()
            .join("\n");

        Ok(json!({
            "output": output_text
        }))
    }

    /// Stop the server process.
    pub async fn stop(&mut self) -> Result<()> {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
        self.stdin = None;
        self.reader = None;
        self.status = ServerStatus::Stopped;
        Ok(())
    }

    async fn send_request(&self, method: &str, params: Option<Value>) -> Result<Value> {
        let stdin_arc = self
            .stdin
            .as_ref()
            .ok_or_else(|| McpError::Transport("MCP server stdin is not open".to_string()))?;

        let reader_arc = self
            .reader
            .as_ref()
            .ok_or_else(|| McpError::Transport("MCP server stdout is not open".to_string()))?;

        let req_id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: json!(req_id),
            method: method.to_string(),
            params,
        };

        let mut payload = serde_json::to_string(&request)?;
        payload.push('\n');

        // Write to stdin
        {
            let mut stdin = stdin_arc.lock().await;
            stdin.write_all(payload.as_bytes()).await?;
            stdin.flush().await?;
        }

        // Read response line from stdout
        let mut line = String::new();
        {
            let mut reader = reader_arc.lock().await;
            reader.read_line(&mut line).await?;
        }

        if line.trim().is_empty() {
            return Err(McpError::Transport("Empty response received from MCP server".to_string()));
        }

        let response: JsonRpcResponse = serde_json::from_str(&line)?;
        if let Some(err) = response.error {
            return Err(McpError::JsonRpc {
                code: err.code,
                message: err.message,
            });
        }

        response
            .result
            .ok_or_else(|| McpError::Protocol("Response missing both result and error".to_string()))
    }

    async fn send_notification(&self, method: &str, params: Option<Value>) -> Result<()> {
        let stdin_arc = self
            .stdin
            .as_ref()
            .ok_or_else(|| McpError::Transport("MCP server stdin is not open".to_string()))?;

        let notification = JsonRpcNotification {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
        };

        let mut payload = serde_json::to_string(&notification)?;
        payload.push('\n');

        let mut stdin = stdin_arc.lock().await;
        stdin.write_all(payload.as_bytes()).await?;
        stdin.flush().await?;
        Ok(())
    }
}

impl Drop for StdioMcpClient {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.start_kill();
        }
    }
}
