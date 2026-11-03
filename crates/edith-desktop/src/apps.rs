use std::path::{Path, PathBuf};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};
use crate::error::DesktopError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppInfo {
    pub id: String,
    pub name: String,
    pub generic_name: Option<String>,
    pub comment: Option<String>,
    pub exec: String,
    pub icon: Option<String>,
    pub categories: Vec<String>,
    pub terminal: bool,
    pub path: String,
}

pub struct AppLauncher {
    app_dirs: Vec<PathBuf>,
}

impl Default for AppLauncher {
    fn default() -> Self {
        Self::new()
    }
}

impl AppLauncher {
    pub fn new() -> Self {
        let mut dirs = vec![
            PathBuf::from("/usr/share/applications"),
            PathBuf::from("/usr/local/share/applications"),
            PathBuf::from("/var/lib/flatpak/exports/share/applications"),
            PathBuf::from("/var/lib/snapd/desktop/applications"),
        ];

        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(home).join(".local/share/applications"));
        }

        Self { app_dirs: dirs }
    }

    pub fn with_dirs(dirs: Vec<PathBuf>) -> Self {
        Self { app_dirs: dirs }
    }

    pub async fn discover_apps(&self) -> Vec<AppInfo> {
        let mut apps = HashMap::new();

        for dir in &self.app_dirs {
            if !dir.exists() {
                continue;
            }

            let mut entries = match tokio::fs::read_dir(dir).await {
                Ok(entries) => entries,
                Err(e) => {
                    debug!("Failed to read app dir {:?}: {}", dir, e);
                    continue;
                }
            };

            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) == Some("desktop") {
                    if let Ok(content) = tokio::fs::read_to_string(&path).await {
                        if let Some(app) = Self::parse_desktop_entry(&path, &content) {
                            apps.entry(app.id.clone()).or_insert(app);
                        }
                    }
                }
            }
        }

        let mut app_list: Vec<AppInfo> = apps.into_values().collect();
        app_list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        app_list
    }

    pub fn parse_desktop_entry(path: &Path, content: &str) -> Option<AppInfo> {
        let file_stem = path.file_name()?.to_str()?.to_string();
        let mut in_desktop_entry = false;
        let mut name: Option<String> = None;
        let mut generic_name: Option<String> = None;
        let mut comment: Option<String> = None;
        let mut exec: Option<String> = None;
        let mut icon: Option<String> = None;
        let mut categories: Vec<String> = Vec::new();
        let mut terminal = false;
        let mut no_display = false;
        let mut is_app = true;

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            if line.starts_with('[') && line.ends_with(']') {
                in_desktop_entry = line == "[Desktop Entry]";
                continue;
            }

            if !in_desktop_entry {
                continue;
            }

            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim();
                let val = val.trim();

                match key {
                    "Type" => {
                        if val != "Application" {
                            is_app = false;
                        }
                    }
                    "Name" => {
                        if name.is_none() {
                            name = Some(val.to_string());
                        }
                    }
                    "GenericName" => {
                        if generic_name.is_none() {
                            generic_name = Some(val.to_string());
                        }
                    }
                    "Comment" => {
                        if comment.is_none() {
                            comment = Some(val.to_string());
                        }
                    }
                    "Exec" => {
                        if exec.is_none() {
                            exec = Some(Self::clean_exec(val));
                        }
                    }
                    "Icon" => {
                        if icon.is_none() {
                            icon = Some(val.to_string());
                        }
                    }
                    "Categories" => {
                        categories = val
                            .split(';')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect();
                    }
                    "Terminal" => {
                        terminal = val.eq_ignore_ascii_case("true");
                    }
                    "NoDisplay" => {
                        if val.eq_ignore_ascii_case("true") {
                            no_display = true;
                        }
                    }
                    _ => {}
                }
            }
        }

        if !is_app || no_display {
            return None;
        }

        let name = name?;
        let exec = exec?;

        Some(AppInfo {
            id: file_stem,
            name,
            generic_name,
            comment,
            exec,
            icon,
            categories,
            terminal,
            path: path.to_string_lossy().to_string(),
        })
    }

    pub fn clean_exec(exec_line: &str) -> String {
        // Strip XDG field codes (%f, %F, %u, %U, %d, %D, %n, %N, %i, %c, %k, %v, %m)
        let mut tokens: Vec<&str> = Vec::new();
        for token in exec_line.split_whitespace() {
            if token.starts_with('%') && token.len() == 2 {
                continue;
            }
            tokens.push(token);
        }
        tokens.join(" ")
    }

    pub async fn search_apps(&self, query: &str) -> Vec<AppInfo> {
        let q = query.trim().to_lowercase();
        let apps = self.discover_apps().await;
        if q.is_empty() {
            return apps;
        }

        apps.into_iter()
            .filter(|app| {
                app.name.to_lowercase().contains(&q)
                    || app.id.to_lowercase().contains(&q)
                    || app.exec.to_lowercase().contains(&q)
                    || app.generic_name.as_ref().map_or(false, |gn| gn.to_lowercase().contains(&q))
            })
            .collect()
    }

    pub async fn launch_app(&self, app_id_or_name: &str, args: &[String]) -> Result<u32, DesktopError> {
        let apps = self.discover_apps().await;
        let matched = apps
            .iter()
            .find(|a| a.id.eq_ignore_ascii_case(app_id_or_name) || a.name.eq_ignore_ascii_case(app_id_or_name))
            .or_else(|| {
                apps.iter().find(|a| {
                    a.id.to_lowercase().contains(&app_id_or_name.to_lowercase())
                        || a.name.to_lowercase().contains(&app_id_or_name.to_lowercase())
                })
            })
            .ok_or_else(|| DesktopError::AppNotFound(app_id_or_name.to_string()))?;

        info!("Launching desktop app: {} ({})", matched.name, matched.exec);

        let parts: Vec<&str> = matched.exec.split_whitespace().collect();
        if parts.is_empty() {
            return Err(DesktopError::LaunchFailed("Empty exec field".to_string()));
        }

        let program = parts[0];
        let mut cmd = tokio::process::Command::new(program);
        if parts.len() > 1 {
            cmd.args(&parts[1..]);
        }
        if !args.is_empty() {
            cmd.args(args);
        }

        // Spawn detached process
        let child = cmd
            .spawn()
            .map_err(|e| DesktopError::LaunchFailed(format!("Failed to spawn '{}': {}", program, e)))?;

        let pid = child.id().unwrap_or(0);
        info!("Spawned process '{}' with PID {}", program, pid);
        Ok(pid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_desktop_entry() {
        let sample = r#"
[Desktop Entry]
Version=1.0
Type=Application
Name=Text Editor
GenericName=Editor
Comment=Edit text files
Exec=gedit %U
Icon=org.gnome.gedit
Terminal=false
Categories=GNOME;GTK;Utility;TextEditor;
"#;
        let path = Path::new("/usr/share/applications/org.gnome.gedit.desktop");
        let app = AppLauncher::parse_desktop_entry(path, sample).expect("valid desktop app");

        assert_eq!(app.id, "org.gnome.gedit.desktop");
        assert_eq!(app.name, "Text Editor");
        assert_eq!(app.generic_name.as_deref(), Some("Editor"));
        assert_eq!(app.exec, "gedit");
        assert_eq!(app.icon.as_deref(), Some("org.gnome.gedit"));
        assert!(!app.terminal);
        assert_eq!(app.categories, vec!["GNOME", "GTK", "Utility", "TextEditor"]);
    }

    #[test]
    fn test_nodisplay_is_filtered() {
        let sample = r#"
[Desktop Entry]
Type=Application
Name=Hidden Utility
Exec=hidden-tool
NoDisplay=true
"#;
        let path = Path::new("/usr/share/applications/hidden.desktop");
        let app = AppLauncher::parse_desktop_entry(path, sample);
        assert!(app.is_none());
    }

    #[test]
    fn test_clean_exec() {
        assert_eq!(AppLauncher::clean_exec("google-chrome-stable %U"), "google-chrome-stable");
        assert_eq!(AppLauncher::clean_exec("vlc --started-from-file %F"), "vlc --started-from-file");
    }
}
