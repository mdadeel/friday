use edith_api::{create_router, AppState};
use edith_core::config::TransportMode;
use edith_core::EdithConfig;
use edith_events::EventBus;
use edith_storage::Storage;
use std::os::unix::fs::PermissionsExt;
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Initialize structured logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,edith_daemon=debug,edith_api=debug,edith_storage=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting EDITH 2.0 Daemon (edith-daemon)...");

    // 2. Load Configuration
    let config_path = std::env::var("EDITH_CONFIG").unwrap_or_else(|_| "edith.toml".to_string());
    let config = if std::path::Path::new(&config_path).exists() {
        info!("Loading configuration from {config_path}");
        EdithConfig::load_from_file(&config_path)?
    } else {
        info!("Using default configuration");
        EdithConfig::default()
    };

    // 3. Initialize Storage
    info!(
        "Initializing storage at {:?}",
        config.storage.database_path
    );
    let storage = Storage::open(&config.storage.database_path)?;

    // 4. Initialize Event Bus
    let event_bus = EventBus::new(1024);

    // 5. Initialize Model Provider Registry
    info!("Initializing Model Provider Registry...");
    let provider_registry = edith_models::ProviderRegistry::new();
    let ollama_adapter = std::sync::Arc::new(edith_models::OllamaAdapter::new(&config.models.ollama_url));
    provider_registry.register(ollama_adapter).await;
    let mock_provider = std::sync::Arc::new(edith_models::MockProvider::default());
    provider_registry.register(mock_provider).await;

    // Check health of registered providers on startup
    let health_map = provider_registry.check_all_health().await;
    for (id, health) in health_map {
        match health {
            Ok(h) => info!("Provider [{id}]: {} (latency: {:?}, models: {:?})", h.status, h.latency_ms, h.available_models),
            Err(e) => warn!("Provider [{id}] offline or degraded: {e}"),
        }
    }

    // 6. Generate / configure Bearer Token
    let auth_token = config
        .server
        .auth_token
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // Save token to runtime dir for local authorized clients
    if let Some(runtime_dir) = config.server.socket_path.parent() {
        if !runtime_dir.exists() {
            std::fs::create_dir_all(runtime_dir)?;
            let _ = std::fs::set_permissions(runtime_dir, std::fs::Permissions::from_mode(0o700));
        }
        let token_path = runtime_dir.join("token");
        std::fs::write(&token_path, &auth_token)?;
        let _ = std::fs::set_permissions(&token_path, std::fs::Permissions::from_mode(0o600));
        info!("Stored authentication token at {:?}", token_path);
    }

    // 7. Initialize Voice Engine
    info!(
        "Initializing Voice Engine (ASR: {}, TTS: {})...",
        config.voice.asr_provider, config.voice.tts_provider
    );
    let asr: std::sync::Arc<dyn edith_voice::SpeechRecognizer> = if let Some(ref url) = config.voice.whisper_url {
        std::sync::Arc::new(edith_voice::WhisperCppRecognizer::new(url))
    } else {
        std::sync::Arc::new(edith_voice::MockSpeechRecognizer::default())
    };
    let tts: std::sync::Arc<dyn edith_voice::SpeechSynthesizer> =
        std::sync::Arc::new(edith_voice::MockSpeechSynthesizer);
    let voice = std::sync::Arc::new(edith_voice::VoiceManager::new(
        config.voice.clone(),
        Some(event_bus.clone()),
        asr,
        tts,
    ));

    // 8. Initialize Search & Research Infrastructure
    info!("Initializing Search & Research Infrastructure...");
    let search = std::sync::Arc::new(edith_search::SearchService::default());

    // 9. Initialize Desktop Environment Integrations
    info!("Initializing Desktop Environment Integrations (metrics, app launcher, window context)...");

    // 10. Build API Router
    let app_state = AppState::new(
        storage,
        event_bus.clone(),
        provider_registry,
        Some(auth_token.clone()),
    )
    .with_voice(voice)
    .with_search(search);
    let router = create_router(app_state);

    // 7. Start Listeners
    let mut tasks = Vec::new();

    // TCP Listener
    if config.server.transport == TransportMode::Tcp
        || config.server.transport == TransportMode::Both
    {
        let addr = format!("{}:{}", config.server.tcp_host, config.server.tcp_port);
        let listener = tokio::net::TcpListener::bind(&addr).await?;
        info!("EDITH Local API listening on http://{addr}");
        let app = router.clone();
        tasks.push(tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                error!("TCP server error: {e}");
            }
        }));
    }

    // Unix Domain Socket Listener
    let socket_path = config.server.socket_path.clone();
    if config.server.transport == TransportMode::Unix
        || config.server.transport == TransportMode::Both
    {
        if socket_path.exists() {
            let _ = std::fs::remove_file(&socket_path);
        }
        if let Some(parent) = socket_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let unix_listener = tokio::net::UnixListener::bind(&socket_path)?;
        let _ = std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600));
        info!("EDITH Local API listening on unix:{:?}", socket_path);

        let app = router.clone();
        tasks.push(tokio::spawn(async move {
            // Serve loop for Unix socket
            loop {
                match unix_listener.accept().await {
                    Ok((stream, _)) => {
                        let tower_service = app.clone();
                        tokio::spawn(async move {
                            let socket = hyper_util::rt::TokioIo::new(stream);
                            let hyper_service = hyper_util::service::TowerToHyperService::new(tower_service);
                            if let Err(err) = hyper_util::server::conn::auto::Builder::new(hyper_util::rt::TokioExecutor::new())
                                .serve_connection(socket, hyper_service)
                                .await
                            {
                                warn!("Unix socket connection error: {err}");
                            }
                        });
                    }
                    Err(e) => {
                        error!("Unix socket accept error: {e}");
                        break;
                    }
                }
            }
        }));
    }

    info!("EDITH 2.0 Daemon initialization complete. Ready for requests.");

    // 8. Graceful Shutdown Signal Handling
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("Received SIGINT (Ctrl-C), initiating graceful shutdown...");
        }
    }

    // Clean up socket file
    if socket_path.exists() {
        let _ = std::fs::remove_file(&socket_path);
        info!("Removed socket file {:?}", socket_path);
    }

    info!("EDITH Daemon shutdown completed successfully.");
    Ok(())
}
