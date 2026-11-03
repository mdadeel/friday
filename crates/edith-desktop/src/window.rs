use serde::{Deserialize, Serialize};
use async_trait::async_trait;
use crate::error::DesktopError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WindowInfo {
    pub title: String,
    pub app_name: String,
    pub session_type: String,
    pub desktop_environment: String,
    pub display: String,
    pub workspace: Option<String>,
}

#[async_trait]
pub trait WindowInspector: Send + Sync {
    async fn get_active_window(&self) -> Result<WindowInfo, DesktopError>;
}

pub struct LinuxDesktopInspector;

impl Default for LinuxDesktopInspector {
    fn default() -> Self {
        Self::new()
    }
}

impl LinuxDesktopInspector {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl WindowInspector for LinuxDesktopInspector {
    async fn get_active_window(&self) -> Result<WindowInfo, DesktopError> {
        let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "wayland".to_string());
        let desktop_env = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_else(|_| "ubuntu:GNOME".to_string());
        let display = std::env::var("WAYLAND_DISPLAY")
            .or_else(|_| std::env::var("DISPLAY"))
            .unwrap_or_else(|_| "wayland-0".to_string());

        // Under Linux Wayland, compositors isolate cross-application window inspection for security.
        // We report the active desktop environment session and shell status.
        let mut title = format!("Desktop ({})", desktop_env);
        let mut app_name = desktop_env.clone();

        // If on X11 or XWayland and xdotool is installed, attempt inspection
        if session_type == "x11" {
            if let Ok(output) = tokio::process::Command::new("xdotool")
                .args(["getactivewindow", "getwindowname"])
                .output()
                .await
            {
                if output.status.success() {
                    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !name.is_empty() {
                        title = name;
                        app_name = "X11 Application".to_string();
                    }
                }
            }
        }

        Ok(WindowInfo {
            title,
            app_name,
            session_type,
            desktop_environment: desktop_env,
            display,
            workspace: Some("1".to_string()),
        })
    }
}

pub struct MockWindowInspector {
    pub current_window: std::sync::RwLock<WindowInfo>,
}

impl MockWindowInspector {
    pub fn new(window: WindowInfo) -> Self {
        Self {
            current_window: std::sync::RwLock::new(window),
        }
    }

    pub fn set_window(&self, window: WindowInfo) {
        let mut w = self.current_window.write().unwrap();
        *w = window;
    }
}

#[async_trait]
impl WindowInspector for MockWindowInspector {
    async fn get_active_window(&self) -> Result<WindowInfo, DesktopError> {
        let w = self.current_window.read().unwrap();
        Ok(w.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_window_inspector() {
        let info = WindowInfo {
            title: "EDITH 2.0 Terminal".to_string(),
            app_name: "GNOME Terminal".to_string(),
            session_type: "wayland".to_string(),
            desktop_environment: "ubuntu:GNOME".to_string(),
            display: "wayland-0".to_string(),
            workspace: Some("1".to_string()),
        };

        let inspector = MockWindowInspector::new(info.clone());
        let retrieved = inspector.get_active_window().await.unwrap();
        assert_eq!(retrieved, info);
    }
}
