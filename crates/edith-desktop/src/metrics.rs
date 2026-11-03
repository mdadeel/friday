use serde::{Deserialize, Serialize};
use crate::error::DesktopError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_usage_percent: f64,
    pub load_average: [f64; 3],
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    pub memory_available_bytes: u64,
    pub memory_percent: f64,
    pub uptime_seconds: u64,
    pub disk_total_bytes: u64,
    pub disk_used_bytes: u64,
    pub disk_free_bytes: u64,
    pub disk_percent: f64,
    pub os_name: String,
    pub kernel_version: String,
    pub hostname: String,
}

pub struct SystemMetricsCollector {
    proc_root: String,
}

impl Default for SystemMetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemMetricsCollector {
    pub fn new() -> Self {
        Self {
            proc_root: "/proc".to_string(),
        }
    }

    pub fn with_proc_root(proc_root: impl Into<String>) -> Self {
        Self {
            proc_root: proc_root.into(),
        }
    }

    pub async fn collect(&self) -> Result<SystemMetrics, DesktopError> {
        let (cpu_percent, load_avg) = self.collect_cpu_and_load().await.unwrap_or((0.0, [0.0, 0.0, 0.0]));
        let (mem_total, mem_avail, mem_used, mem_pct) = self.collect_memory().await.unwrap_or((0, 0, 0, 0.0));
        let uptime = self.collect_uptime().await.unwrap_or(0);
        let (disk_total, disk_used, disk_free, disk_pct) = self.collect_disk("/").await.unwrap_or((0, 0, 0, 0.0));
        let (os_name, kernel, hostname) = self.collect_os_info().await;

        Ok(SystemMetrics {
            cpu_usage_percent: (cpu_percent * 100.0).round() / 100.0,
            load_average: [
                (load_avg[0] * 100.0).round() / 100.0,
                (load_avg[1] * 100.0).round() / 100.0,
                (load_avg[2] * 100.0).round() / 100.0,
            ],
            memory_total_bytes: mem_total,
            memory_used_bytes: mem_used,
            memory_available_bytes: mem_avail,
            memory_percent: (mem_pct * 100.0).round() / 100.0,
            uptime_seconds: uptime,
            disk_total_bytes: disk_total,
            disk_used_bytes: disk_used,
            disk_free_bytes: disk_free,
            disk_percent: (disk_pct * 100.0).round() / 100.0,
            os_name,
            kernel_version: kernel,
            hostname,
        })
    }

    async fn collect_cpu_and_load(&self) -> Result<(f64, [f64; 3]), DesktopError> {
        let load_path = format!("{}/loadavg", self.proc_root);
        let stat_path = format!("{}/stat", self.proc_root);

        let mut load_avg = [0.0; 3];
        if let Ok(content) = tokio::fs::read_to_string(&load_path).await {
            load_avg = Self::parse_loadavg(&content);
        }

        let mut cpu_percent = 0.0;
        if let Ok(content) = tokio::fs::read_to_string(&stat_path).await {
            if let Some(pct) = Self::parse_cpu_stat(&content) {
                cpu_percent = pct;
            }
        }

        Ok((cpu_percent, load_avg))
    }

    pub fn parse_loadavg(content: &str) -> [f64; 3] {
        let parts: Vec<&str> = content.split_whitespace().collect();
        let mut res = [0.0; 3];
        if parts.len() >= 3 {
            if let Ok(v) = parts[0].parse::<f64>() { res[0] = v; }
            if let Ok(v) = parts[1].parse::<f64>() { res[1] = v; }
            if let Ok(v) = parts[2].parse::<f64>() { res[2] = v; }
        }
        res
    }

    pub fn parse_cpu_stat(content: &str) -> Option<f64> {
        for line in content.lines() {
            if line.starts_with("cpu ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 {
                    let user: u64 = parts[1].parse().unwrap_or(0);
                    let nice: u64 = parts[2].parse().unwrap_or(0);
                    let system: u64 = parts[3].parse().unwrap_or(0);
                    let idle: u64 = parts[4].parse().unwrap_or(0);
                    let iowait: u64 = parts.get(5).and_then(|v| v.parse().ok()).unwrap_or(0);
                    let irq: u64 = parts.get(6).and_then(|v| v.parse().ok()).unwrap_or(0);
                    let softirq: u64 = parts.get(7).and_then(|v| v.parse().ok()).unwrap_or(0);
                    let steal: u64 = parts.get(8).and_then(|v| v.parse().ok()).unwrap_or(0);

                    let active = user + nice + system + irq + softirq + steal;
                    let total = active + idle + iowait;
                    if total > 0 {
                        return Some((active as f64 / total as f64) * 100.0);
                    }
                }
            }
        }
        None
    }

    async fn collect_memory(&self) -> Result<(u64, u64, u64, f64), DesktopError> {
        let meminfo_path = format!("{}/meminfo", self.proc_root);
        let content = tokio::fs::read_to_string(&meminfo_path)
            .await
            .map_err(|e| DesktopError::MetricRead(e.to_string()))?;

        Ok(Self::parse_meminfo(&content))
    }

    pub fn parse_meminfo(content: &str) -> (u64, u64, u64, f64) {
        let mut total_kb = 0u64;
        let mut avail_kb = 0u64;
        let mut free_kb = 0u64;

        for line in content.lines() {
            if line.starts_with("MemTotal:") {
                total_kb = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            } else if line.starts_with("MemAvailable:") {
                avail_kb = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            } else if line.starts_with("MemFree:") {
                free_kb = line.split_whitespace().nth(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            }
        }

        let total_bytes = total_kb * 1024;
        let avail_bytes = if avail_kb > 0 { avail_kb * 1024 } else { free_kb * 1024 };
        let used_bytes = total_bytes.saturating_sub(avail_bytes);
        let pct = if total_bytes > 0 {
            (used_bytes as f64 / total_bytes as f64) * 100.0
        } else {
            0.0
        };

        (total_bytes, avail_bytes, used_bytes, pct)
    }

    async fn collect_uptime(&self) -> Result<u64, DesktopError> {
        let uptime_path = format!("{}/uptime", self.proc_root);
        let content = tokio::fs::read_to_string(&uptime_path)
            .await
            .map_err(|e| DesktopError::MetricRead(e.to_string()))?;

        let first = content.split_whitespace().next().unwrap_or("0");
        let seconds: f64 = first.parse().unwrap_or(0.0);
        Ok(seconds as u64)
    }

    async fn collect_disk(&self, path: &str) -> Result<(u64, u64, u64, f64), DesktopError> {
        // Use df command to fetch filesystem capacity safely
        let output = tokio::process::Command::new("df")
            .arg("-k")
            .arg(path)
            .output()
            .await;

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if let Some(parsed) = Self::parse_df(&stdout) {
                    return Ok(parsed);
                }
            }
        }

        Ok((0, 0, 0, 0.0))
    }

    pub fn parse_df(output: &str) -> Option<(u64, u64, u64, f64)> {
        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("Filesystem") {
                continue;
            }
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() >= 6 {
                // Filesystem 1K-blocks Used Available Use% Mounted
                let total_kb: u64 = cols[1].parse().unwrap_or(0);
                let used_kb: u64 = cols[2].parse().unwrap_or(0);
                let avail_kb: u64 = cols[3].parse().unwrap_or(0);

                if total_kb > 0 {
                    let total = total_kb * 1024;
                    let used = used_kb * 1024;
                    let free = avail_kb * 1024;
                    let pct = (used as f64 / total as f64) * 100.0;
                    return Some((total, used, free, pct));
                }
            }
        }
        None
    }

    async fn collect_os_info(&self) -> (String, String, String) {
        let mut os_name = "Linux".to_string();
        let mut kernel = "unknown".to_string();
        let mut hostname = "localhost".to_string();

        if let Ok(etc_os) = tokio::fs::read_to_string("/etc/os-release").await {
            for line in etc_os.lines() {
                if let Some(val) = line.strip_prefix("PRETTY_NAME=") {
                    os_name = val.trim_matches('"').to_string();
                    break;
                }
            }
        }

        let version_path = format!("{}/version", self.proc_root);
        if let Ok(ver) = tokio::fs::read_to_string(&version_path).await {
            let parts: Vec<&str> = ver.split_whitespace().collect();
            if parts.len() >= 3 {
                kernel = format!("{} {}", parts[0], parts[2]);
            }
        }

        let hostname_path = format!("{}/sys/kernel/hostname", self.proc_root);
        if let Ok(h) = tokio::fs::read_to_string(&hostname_path).await {
            hostname = h.trim().to_string();
        } else if let Ok(h) = tokio::fs::read_to_string("/etc/hostname").await {
            hostname = h.trim().to_string();
        }

        (os_name, kernel, hostname)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_loadavg() {
        let sample = "0.45 0.62 0.78 2/1250 49123\n";
        let parsed = SystemMetricsCollector::parse_loadavg(sample);
        assert_eq!(parsed, [0.45, 0.62, 0.78]);
    }

    #[test]
    fn test_parse_meminfo() {
        let sample = r#"
MemTotal:       16384000 kB
MemFree:         4096000 kB
MemAvailable:    8192000 kB
Buffers:          500000 kB
Cached:          3000000 kB
"#;
        let (total, avail, used, pct) = SystemMetricsCollector::parse_meminfo(sample);
        assert_eq!(total, 16384000 * 1024);
        assert_eq!(avail, 8192000 * 1024);
        assert_eq!(used, 8192000 * 1024);
        assert_eq!(pct, 50.0);
    }

    #[test]
    fn test_parse_cpu_stat() {
        let sample = "cpu  1000 0 500 8500 0 0 0 0\n";
        let pct = SystemMetricsCollector::parse_cpu_stat(sample).expect("valid cpu line");
        assert_eq!(pct, 15.0); // 1500 active / 10000 total = 15%
    }

    #[test]
    fn test_parse_df() {
        let sample = r#"
Filesystem     1K-blocks     Used Available Use% Mounted on
/dev/sda1       10000000  4000000   6000000  40% /
"#;
        let (total, used, free, pct) = SystemMetricsCollector::parse_df(sample).expect("valid df output");
        assert_eq!(total, 10000000 * 1024);
        assert_eq!(used, 4000000 * 1024);
        assert_eq!(free, 6000000 * 1024);
        assert_eq!(pct, 40.0);
    }
}
