use std::env;
use serde_json::Value;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let command = args.get(1).map(|s| s.as_str()).unwrap_or("status");

    let base_url = env::var("EDITH_API_URL").unwrap_or_else(|_| "http://127.0.0.1:4242".to_string());
    let token = env::var("EDITH_TOKEN").ok().or_else(|| {
        std::fs::read_to_string("/tmp/edith/token").ok().map(|s| s.trim().to_string())
    });

    let client = reqwest::Client::new();

    match command {
        "status" => {
            println!("--- EDITH 2.0 System Status ---");
            let mut req = client.get(format!("{base_url}/v1/health"));
            if let Some(ref t) = token { req = req.bearer_auth(t); }
            match req.send().await {
                Ok(res) if res.status().is_success() => {
                    let health: Value = res.json().await?;
                    println!("Status:      {}", health["status"]);
                    println!("Version:     {}", health["version"]);
                    println!("Subsystems:  {}", health["subsystems"]);
                }
                Ok(res) => println!("Daemon returned HTTP {}", res.status()),
                Err(e) => println!("Daemon offline or unreachable: {e}"),
            }

            let mut req = client.get(format!("{base_url}/v1/desktop/metrics"));
            if let Some(ref t) = token { req = req.bearer_auth(t); }
            if let Ok(res) = req.send().await {
                if res.status().is_success() {
                    let metrics: Value = res.json().await?;
                    println!("\n--- Host Telemetry ---");
                    println!("OS:          {}", metrics["os_name"]);
                    println!("Kernel:      {}", metrics["kernel_version"]);
                    println!("CPU Usage:   {}%", metrics["cpu_usage_percent"]);
                    println!("Load Avg:    {}", metrics["load_average"]);
                    let mem_used_mb = metrics["memory_used_bytes"].as_u64().unwrap_or(0) / 1024 / 1024;
                    let mem_total_mb = metrics["memory_total_bytes"].as_u64().unwrap_or(0) / 1024 / 1024;
                    println!("RAM:         {} MB / {} MB ({}%)", mem_used_mb, mem_total_mb, metrics["memory_percent"]);
                    println!("Uptime:      {} seconds", metrics["uptime_seconds"]);
                }
            }
        }
        "tools" => {
            let mut req = client.get(format!("{base_url}/v1/tools"));
            if let Some(ref t) = token { req = req.bearer_auth(t); }
            let res = req.send().await?;
            let val: Value = res.json().await?;
            println!("Registered Capabilities (Total: {}):", val["count"]);
            if let Some(tools) = val["tools"].as_array() {
                for t in tools {
                    println!("  * {:<24} [{}] {}", t["name"].as_str().unwrap_or(""), t["default_autonomy"].as_str().unwrap_or(""), t["description"].as_str().unwrap_or(""));
                }
            }
        }
        "memory" => {
            let mut req = client.get(format!("{base_url}/v1/memory/items"));
            if let Some(ref t) = token { req = req.bearer_auth(t); }
            let res = req.send().await?;
            let val: Value = res.json().await?;
            println!("Persistent Memory Items:");
            if let Some(items) = val.as_array() {
                for it in items {
                    println!("  [{}] ({}, conf: {}) {}", it["provenance"].as_str().unwrap_or(""), it["category"].as_str().unwrap_or(""), it["confidence"], it["content"].as_str().unwrap_or(""));
                }
            }
        }
        "apps" => {
            let query = args.get(2).map(|s| s.as_str()).unwrap_or("");
            let mut req = client.get(format!("{base_url}/v1/desktop/apps?q={query}"));
            if let Some(ref t) = token { req = req.bearer_auth(t); }
            let res = req.send().await?;
            let val: Value = res.json().await?;
            println!("Installed Desktop Applications (Found: {}):", val["count"]);
            if let Some(apps) = val["apps"].as_array() {
                for a in apps {
                    println!("  * {:<24} -> {}", a["name"].as_str().unwrap_or(""), a["exec"].as_str().unwrap_or(""));
                }
            }
        }
        "chat" => {
            let msg = args[2..].join(" ");
            if msg.trim().is_empty() {
                eprintln!("Usage: edith chat <message>");
                std::process::exit(1);
            }

            // Create session
            let mut req = client.post(format!("{base_url}/v1/sessions")).json(&serde_json::json!({"title": "CLI Session"}));
            if let Some(ref t) = token { req = req.bearer_auth(t); }
            let s_res = req.send().await?;
            let s_val: Value = s_res.json().await?;
            let session_id = s_val["id"].as_str().unwrap_or("default");

            // Post message
            let mut req = client.post(format!("{base_url}/v1/sessions/{session_id}/messages"))
                .json(&serde_json::json!({"text": msg, "source": "text"}));
            if let Some(ref t) = token { req = req.bearer_auth(t); }
            let _res = req.send().await?;

            // Poll for assistant response
            print!("Thinking");
            let mut reply = String::new();
            for _ in 0..30 {
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
                print!(".");
                use std::io::Write;
                let _ = std::io::stdout().flush();

                let mut req = client.get(format!("{base_url}/v1/sessions/{session_id}/turns"));
                if let Some(ref t) = token { req = req.bearer_auth(t); }
                if let Ok(res) = req.send().await {
                    if let Ok(turns) = res.json::<Vec<Value>>().await {
                        if let Some(last) = turns.iter().rev().find(|t| t["role"] == "assistant") {
                            if let Some(c) = last["content"].as_str() {
                                reply = c.to_string();
                                break;
                            }
                        }
                    }
                }
            }
            println!("\n\nEDITH: {}", reply);
        }
        _ => {
            println!("EDITH 2.0 CLI");
            println!("Commands:");
            println!("  edith status         Display system health and host telemetry");
            println!("  edith tools          List registered agent tools and capabilities");
            println!("  edith memory         List persistent memory items");
            println!("  edith apps [query]   Search installed desktop applications");
            println!("  edith chat <msg>     Send a message to EDITH agent");
        }
    }

    Ok(())
}
