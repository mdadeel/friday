# EDITH 2.0 — Engineering Changelog

## [0.10.0] - 2026-11-03

### Phase 10: Desktop Environment Integrations
- Created crate [`crates/edith-desktop`](crates/edith-desktop):
  - **Linux System Metrics Collector** (`metrics.rs`):
    - Real-time kernel telemetry collector parsing `/proc/stat` (CPU usage %), `/proc/loadavg` (1m, 5m, 15m loads), `/proc/meminfo` (total, available, used memory bytes and %), `/proc/uptime`, `/etc/os-release`, and `/proc/version`.
    - Storage volume inspection parsing filesystem capacity, used, and free bytes via `df -k /`.
  - **FreeDesktop XDG Application Discovery & Launcher** (`apps.rs`):
    - Scans system and user desktop entry directories (`/usr/share/applications`, `~/.local/share/applications`, Flatpak, Snap).
    - Parses INI `[Desktop Entry]` specifications: ID, Name, GenericName, Comment, Exec, Icon, Categories, Terminal, and filters `NoDisplay` entries.
    - Strips XDG parameter field codes (`%u`, `%f`, `%F`, etc.) to produce clean executable command lines.
    - Asynchronous process spawner with argument forwarding and PID return.
  - **Desktop Environment & Window Context Inspector** (`window.rs`):
    - Inspects display server (`wayland` vs `x11`), desktop environment (`ubuntu:GNOME`), and active display (`wayland-0`).
    - Provides `WindowInspector` trait and `MockWindowInspector` for deterministic unit testing.
  - **Native Agent Tools** (`tools.rs`):
    - `desktop.system_metrics`: returns host CPU %, load averages, RAM used/total, disk capacity, uptime.
    - `desktop.list_apps`: lists installed desktop applications with query filtering.
    - `desktop.launch_app`: launches desktop applications by ID or name with arguments under `ConfirmationRequired` policy.
    - `desktop.active_window`: queries active desktop environment context and window state.
- API and Daemon Integration:
  - Added desktop routes in `edith-api`: `GET /v1/desktop/metrics`, `GET /v1/desktop/apps`, `POST /v1/desktop/launch`, `GET /v1/desktop/window`.
  - Registered all 4 desktop tools into `ToolRegistry`, raising total registered tools to 11.
  - Wired into `AppState` and initialized during daemon startup.
- Verification & Testing:
  - 11 new tests added (10 unit tests in `edith-desktop` + 1 integration test in `edith-api`).
  - Workspace test suite passes with **96 tests passing** across all 13 crates.
  - Live daemon tested with curl: `GET /v1/desktop/metrics` reports real host telemetry (5.14% CPU, 14.5 GB RAM, Ubuntu 26.04.1 LTS); `GET /v1/desktop/apps?q=chrome` returns Google Chrome `.desktop` definition; `GET /v1/desktop/window` returns GNOME Wayland context; `GET /v1/tools` enumerates all 11 registered tools.

---

## [0.9.0] - 2026-11-03

### Phase 9: Search & Research Infrastructure
- Created crate [`crates/edith-search`](crates/edith-search):
  - **Safe Web Fetcher & SSRF Defense** (`fetcher.rs`):
    - Strict SSRF policy blocking non-routable, loopback, private RFC 1918 IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), and unique-local IPv6 (`fc00::/7`, `::1`).
    - Enforced connection/read timeouts (default 10s) and body response cap (5 MB).
    - Blocks non-HTTP/HTTPS schemes and disallows private DNS name patterns.
  - **HTML Content Extractor & Markdown Normalization** (`extractor.rs`):
    - Strips non-content tags (`<head>`, `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<iframe>`).
    - Converts HTML headings, paragraphs, and list items into structured text blocks while collapsing whitespace.
    - Generates SHA-256 document content hashes and chunks extracted text into stable `EvidenceBlock` entries (`{hash_prefix}:{index}`).
  - **Evidence Verification Contract** (`evidence.rs`):
    - `EvidenceVerifier` validating that cited snippets or claims strictly match the underlying source document text.
    - Prevents model hallucinations by rejecting evidence where the quote cannot be verified verbatim against the document hash (`EvidenceMismatch`).
  - **Multi-Provider Search Service** (`service.rs`):
    - Implemented `DuckDuckGoProvider` with automated fallback to `MockSearchProvider` when offline or unconfigured.
    - Parallel page fetch, extraction, and evidence compilation.
  - **Native Agent Tools** (`tools.rs`):
    - Implemented `WebSearchTool` (`web.search`): queries search engine, fetches top results, extracts text snippets and structured evidence blocks.
    - Implemented `WebFetchTool` (`web.fetch`): safely retrieves public web pages with SSRF validation, returns extracted text blocks and SHA-256 content hashes.
- API and Daemon Integration:
  - Registered `web.search` and `web.fetch` into the `ToolRegistry` (raising total registered tools to 7).
  - Added search API endpoints to `edith-api`: `POST /v1/search`, `POST /v1/search/fetch`, `POST /v1/search/evidence`.
  - Initialized `SearchService` and configured `AgentRuntime` with search tools in `apps/daemon/src/main.rs`.
- Verification & Testing:
  - 9 new tests added (8 in `edith-search` + 1 integration test in `edith-api`).
  - Workspace test suite passes with **85 tests passing** across all 12 crates.
  - Live daemon tested with curl: `GET /v1/tools` lists `web.search` and `web.fetch`; `POST /v1/search` returns structured search results; `POST /v1/search/fetch` against `127.0.0.1` is blocked with `403 Forbidden` (`SSRF blocked`).

---

## [0.8.0] - 2026-11-03

### Phase 8: Voice Engine
- Created crate [`crates/edith-voice`](crates/edith-voice):
  - **Audio Capture & Ring Buffer** (`audio.rs`):
    - Circular buffer storing 16-bit 16 kHz mono PCM samples with capacity bounds (default 160,000 samples = 10s of audio).
    - `AudioMetrics` utility calculating RMS energy and dBFS levels (`calculate_db`).
  - **Voice State Machine & Privacy Gatekeeper** (`state.rs`):
    - Implemented full state machine: `Off`, `Idle`, `Listening`, `Transcribing`, `Finalising`, `Dispatching`, `Thinking`, `Speaking`, `Interrupted`, `Error`.
    - Strict privacy rule: `is_mic_active` returns `true` only during `Listening`, `Transcribing`, `Finalising`, and `Speaking` (barge-in monitoring).
    - Microphones are strictly closed and protected in `Off`, `Idle`, `Thinking`, `Dispatching`, or `Error`.
  - **Voice Activity Detection (VAD) & Endpointer** (`vad.rs`):
    - Speech onset detection requiring >= 150 ms of sustained speech above RMS energy threshold (avoids coughs/clicks).
    - Continuous silence detection (>= 700 ms) triggering automatic speech endpointing.
    - Manual endpoint support for push-to-talk (PTT) release.
  - **Sentence Segmenter & Spoken Text Preparation** (`segmenter.rs`):
    - Sanitizes markdown responses for pleasant spoken delivery: replaces code blocks (` ```...``` ` -> "[code block omitted]"), strips tables, converts links (`[text](url)` -> "text"), and normalizes punctuation.
    - Incremental sentence chunker splitting text into speakable sentences for streaming TTS.
  - **Speech Recognition (ASR)** (`asr.rs`):
    - Defined `SpeechRecognizer` trait and `TranscriptionResult`.
    - Built-in 16-bit mono 16 kHz RIFF WAV encoder (`encode_wav_mono`).
    - Implemented `WhisperCppRecognizer` HTTP adapter connecting to local whisper.cpp server.
    - Implemented deterministic `MockSpeechRecognizer` for offline automated testing.
  - **Speech Synthesis (TTS)** (`tts.rs`):
    - Defined `SpeechSynthesizer` trait and `AudioData`.
    - Implemented `CommandSpeechSynthesizer` for Linux TTS engines.
    - Implemented `MockSpeechSynthesizer` generating test PCM audio with durations matched to word count.
  - **Barge-in Controller** (`barge_in.rs`):
    - Sub-150ms cancellation sink for TTS playback upon speech onset detection during `Speaking`.
  - **Voice Engine Facade** (`manager.rs`):
    - `VoiceManager` coordinating state machine, audio buffer, VAD, ASR, TTS, barge-in, and `EventBus` broadcasts (`voice.state_changed`, `voice.level_meter`, `voice.speech_onset`, `voice.speech_endpoint`, `voice.transcription`, `voice.speech_started`, `voice.speech_completed`, `voice.barge_in`).
    - Enforces confidence gate: transcriptions with confidence < 0.40 are discarded without dispatching.
- API and Daemon Integration:
  - Updated `edith-core::config::VoiceConfig` with defaults (`enabled`, `asr_provider`, `tts_provider`, `sample_rate`, `vad_silence_ms`, `barge_in_ms`, `whisper_url`).
  - Added voice endpoints in `edith-api`: `GET /v1/voice/status`, `POST /v1/voice/start`, `POST /v1/voice/stop`, `POST /v1/voice/cancel`, `POST /v1/voice/audio`, and `POST /v1/voice/tts`.
  - Updated `GET /v1/status` to report real live voice state.
  - Initialized `VoiceManager` in `apps/daemon/src/main.rs`.
- Verification & Testing:
  - 20 new tests added (19 unit tests in `edith-voice` + 1 integration test in `edith-api`).
  - Full workspace test suite passes with **76 tests passing** across all 11 crates.
  - Live daemon tested with curl: `GET /v1/voice/status` returns idle state; `POST /v1/voice/audio` while idle is rejected with 400 Bad Request; PTT start enters listening with mic active; audio frames trigger onset and transcribing; PTT stop returns final transcript and enters thinking with mic closed; and TTS synthesizes spoken audio frames.

---

## [0.7.0] - 2026-11-03

### Phase 7: Persistent Memory
- Database Migration 0003:
  - Added embedded SQLite migration `0003_memory_enhancements.sql` enhancing `memory_items` (`updated_at`, `expires_at`, `content_hash`) and creating `memory_sources` table.
  - Implemented async CRUD, full-text search, and pagination in `edith-storage`: `create_memory_item`, `get_memory_item`, `list_memory_items`, `search_memory_items`, `update_memory_item`, and `delete_memory_item`.
- Created crate [`crates/edith-memory`](crates/edith-memory):
  - Implemented `MemoryGatekeeper` (`provenance.rs`):
    - Content validation and credential protection: intercepts and rejects sensitive credentials (`DataClass::Secret`, e.g. API keys, JWT bearer tokens, SSH/RSA private keys).
    - Enforces confidence clamping: `Inferred` facts capped at 0.80, `Assumption` capped at 0.50, and confirmed facts elevated to >= 0.95.
    - `can_state_as_fact` rule: guarantees inferred facts are never stated as firm facts without user confirmation.
  - Implemented `MemoryService` (`service.rs`):
    - Four memory categories: Episodic, Semantic, Procedural, and Working.
    - Working context with expiration TTL.
    - Memory confirmation: elevates unconfirmed/inferred memories to explicit facts.
    - Dynamic prompt context generation: formats active confirmed facts into bullet lists for model context.
- Integrated Persistent Memory into Agent Runtime and API:
  - `AgentRuntime` now fetches active memories and injects them directly into `ContextBuilder` working context.
  - Completed tasks and conversational turns automatically log episodic memory events.
  - Added memory endpoints to `edith-api`: `GET /v1/memory/items`, `POST /v1/memory/items`, `PATCH /v1/memory/items/{id}`, and `DELETE /v1/memory/items/{id}`.
- Verification & Testing:
  - 6 new unit and integration tests added across `edith-memory`, `edith-storage`, and `edith-api`.
  - Full workspace test suite passes with **56 tests passing** across all 10 crates.
  - Live daemon tested with curl: `POST /v1/memory/items` persists facts in SQLite, `GET /v1/memory/items?q=...` performs keyword search, and secret injection attempts are rejected with 400 Bad Request.

---

## [0.6.0] - 2026-11-03

### Phase 6: Tool & MCP Infrastructure
- Created crate [`crates/edith-tools`](crates/edith-tools):
  - Defined unified [`Tool`](crates/edith-tools/src/tool.rs) trait supporting async execution, JSON Schema parameters, declared `SideEffects` (None, Read, Write, Network, Process, System), and `AutonomyClass`.
  - Implemented pure [`PolicyEngine`](crates/edith-tools/src/policy.rs):
    - Path containment validation preventing directory traversal escapes (`..`) and guarding sensitive system paths (`/etc`, `/boot`, `/sys`, `/proc`, `~/.ssh`, `~/.gnupg`).
    - Command template enforcement disallowing raw shell string interpolation (`bash -c`, `sh -c`) and validating allowlisted developer binaries (`git`, `cargo`, `npm`, `node`, `python3`, `echo`, `cat`, `ls`).
    - Evaluates autonomy decisions into `Allow`, `ConfirmRequired`, or `Deny`.
  - Implemented core native tools in `native/`:
    - `fs.read_file`: Scoped UTF-8 file reading with 2MB memory protection.
    - `fs.write_file`: Scoped file writing with automatic parent directory creation.
    - `fs.list_dir`: Scoped directory enumeration with sorted entry metadata.
    - `system.execute_command`: Direct child process execution with stdout/stderr stream truncation at 1MB and timeouts.
    - `datetime.now`: Current ISO 8601 local and UTC timestamps and timezone offset.
  - Implemented [`ToolRegistry`](crates/edith-tools/src/registry.rs):
    - Thread-safe tool management, discovery, and schema export (`export_schemas()`) compatible with OpenAI, Gemini, and Qwen function calling.
    - Policy-gated tool invocation.
- Created crate [`crates/edith-mcp`](crates/edith-mcp):
  - Implemented Model Context Protocol (MCP) JSON-RPC 2.0 types and protocol models.
  - Implemented [`StdioMcpClient`](crates/edith-mcp/src/client.rs) managing child process lifecycle, initialization handshake (`initialize` / `notifications/initialized`), `tools/list` discovery, and `tools/call` invocation.
  - Implemented [`McpToolAdapter`](crates/edith-mcp/src/adapter.rs) dynamically translating MCP tools into EDITH `Tool` trait instances under the `mcp:<server_id>/<tool_name>` namespace.
- Integrated Tools into Agent Runtime and API:
  - Wired `ToolRegistry` and `PolicyEngine` into [`ExecutionEngine`](crates/edith-agent/src/executor.rs) so multi-step plans execute real native and MCP tools.
  - Added dynamic tool capability injection into [`ContextBuilder`](crates/edith-agent/src/context.rs).
  - Added `GET /v1/tools` and `GET /v1/capabilities` endpoints to `edith-api`.
- Verification & Testing:
  - 11 new unit and integration tests added across `edith-tools`, `edith-mcp`, `edith-agent`, and `edith-api`.
  - Full workspace test suite passes with **50 tests passing** across all 9 crates.
  - Live daemon tested with curl: `GET /v1/tools` successfully enumerates registered tools with schemas and autonomy policies.

---

## [0.5.0] - 2026-11-03

### Phase 5: Intelligent Model Routing
- Created crate [`crates/edith-router`](crates/edith-router):
  - Implemented `Tier0Matcher` (`tier0.rs`):
    - Instant 0-token deterministic pattern matching for time, date, system health status, and arithmetic expressions (e.g. `(25 + 75) * 4`).
    - Eliminates model latency and token costs for basic queries, returning 100% deterministic results with zero hallucination.
  - Implemented `ComplexityClassifier` (`classifier.rs`):
    - Multi-tier complexity classification across Tier 1 (fast local models e.g. `qwen3:0.6b`), Tier 2 (reasoning local models e.g. `qwen3:4b`), Tier 3 (workhorse cloud e.g. Claude 3.5 Sonnet / Gemini 1.5 Pro), and Tier 4 (deep frontier reasoning).
  - Implemented `RouteDecision` (`decision.rs`) and `ModelRouter` (`router.rs`):
    - Selects optimal provider and model tier with fallback chains.
    - Automatically records routing audit logs into SQLite `route_decisions` table with execution tier, provider, model name, and routing rationale.
- Integrated `ModelRouter` into `edith-agent`:
  - `AgentRuntime` now routes all user objectives through `ModelRouter`.
  - When Tier 0 matches, immediately returns deterministic answer and completes task without invoking an LLM.
  - When non-Tier 0, selects primary provider with fallback chain and records routing decision.
- Verification & Testing:
  - 11 unit tests added in `crates/edith-router`.
  - Full workspace test suite passes (37 tests total).
  - Live daemon tests verified: math calculation `(25 + 75) * 4 = 400` and current time queries executed with 0 tokens and audit trail recorded.

---

## [0.4.0] - 2026-11-03

### Phase 4: Agent Runtime & Orchestration
- Created crate [`crates/edith-agent`](crates/edith-agent):
  - Implemented `TaskStateMachine` enforcing legal lifecycle transitions (`Discovered` -> `Planning` -> `Executing` -> `Verifying` -> `Completed` / `Failed` / `Cancelled`) with guard validation.
  - Implemented `Plan`, `PlanStep`, and dependency wave topological graph solver in `plan.rs`.
  - Implemented `ContextBuilder` assembling dynamic system prompt, current timestamp/timezone, tool definitions, working scratchpad, and token-bounded conversation history.
  - Implemented `VerificationEngine` enforcing mechanical, evidence-based, and user-confirmed verification gates.
  - Implemented `ExecutionEngine` executing multi-step plan waves concurrently, dispatching step handlers, emitting lifecycle events (`step.started`, `step.completed`, `step.failed`), and handling early cancellation.
  - Implemented `AgentRuntime` coordinating end-to-end task execution:
    - Automatically classifies objectives into conversational streaming or multi-step execution graphs.
    - Transitions task state across lifecycle and synchronizes changes in SQLite and EventBus.
- Integrated `AgentRuntime` into `edith-api`:
  - Added `AgentRuntime` to `AppState`.
  - Updated `POST /v1/sessions/{id}/messages` to delegate objective execution directly to `AgentRuntime`.
  - Removed duplicate streaming worker in favor of the unified agent runtime.
- Verification & Testing:
  - 11 unit and integration tests added in `crates/edith-agent`.
  - Full workspace test suite passes (26 tests total).
  - Verified live daemon execution with curl: multi-step plan generated, executed, verified, and completed.

---

## [0.3.0] - 2026-11-03

### Phase 3: Conversation Engine
- Database Migrations & Turn Schema:
  - Added embedded SQLite migration `0002_add_thinking_to_turns.sql` adding `thinking TEXT` column to `turns` table.
  - Updated `edith-storage` migration runner with sequential migration execution and tracking in `schema_migrations`.
  - Added CRUD methods in `Storage`: `get_session`, `update_session_title`, `delete_session` (with child turn cascade deletion and task unlinking), `get_turn`, `update_turn`, `delete_turn`, and `update_task_state` with completion timestamps.
- Streaming Conversation Execution Engine:
  - Integrated `tokio-util` cancellation tokens in `AppState` for in-flight generation cancellation.
  - Implemented async streaming worker `process_conversation` in `edith-api`:
    - Retrieves conversation history from storage and constructs chronological `ChatMessage` prompts.
    - Dynamically selects optimal registered provider (`ollama` with `qwen3:0.6b` or `mock`).
    - Streams tokens via `complete_stream` and broadcasts `message.delta` events on `EventBus`.
    - Handles stream cancellation gracefully via `cancel_token.cancelled()`, marking tasks cancelled.
    - Captures and stores Qwen3 `thinking` separately from conversational response content.
    - Persists assistant turn in SQLite with thinking and emits `message.final`.
    - Transitions task state from `discovered` -> `executing` -> `completed` (or `failed` / `cancelled`).
- API Endpoints:
  - Added session CRUD: `GET /v1/sessions/{id}`, `PATCH /v1/sessions/{id}`, `DELETE /v1/sessions/{id}`.
  - Added turn CRUD: `GET /v1/sessions/{id}/turns/{turn_id}`, `PATCH /v1/sessions/{id}/turns/{turn_id}`, `DELETE /v1/sessions/{id}/turns/{turn_id}`.
  - Added cancellation endpoint: `POST /v1/sessions/{id}/cancel`.
  - Updated `POST /v1/sessions/{id}/messages` to spawn background worker and return 202 Accepted.
- Testing & Live Verification:
  - Added comprehensive integration tests in `crates/edith-api/tests/api_integration_tests.rs`:
    - `test_end_to_end_conversation_streaming_and_persistence`
    - `test_session_and_turn_crud_endpoints`
    - `test_cancellation_endpoint`
  - All 15 workspace tests pass (`cargo test --workspace`).
  - Tested live daemon with curl against local Ollama instance (`qwen3:0.6b`), verified real-time token streaming, thinking persistence, and task completion.

---

## [0.2.0] - 2026-11-03

### Phase 2: Model Provider Infrastructure
- Created crate [`crates/edith-models`](crates/edith-models):
  - Defined provider-agnostic [`ModelProvider`](crates/edith-models/src/provider.rs) trait supporting `check_health`, non-streaming `complete`, and streaming `complete_stream`.
  - Implemented core message types: `ChatMessage`, `ModelRequest`, `ModelResponse`, `ModelStreamChunk`, `TokenUsage`, `ModelCapabilities`, and `ProviderHealth`.
  - Implemented [`MockProvider`](crates/edith-models/src/adapters/mock.rs) for deterministic offline unit testing, failure simulation, and synthetic stream generation.
  - Implemented [`OllamaAdapter`](crates/edith-models/src/adapters/ollama.rs) connecting directly to the host's local Ollama instance (`http://127.0.0.1:11434`):
    - Real-time health check and model enumeration via `/api/tags`.
    - Non-streaming chat completion via `/api/chat` with Qwen3 thinking extraction and token evaluation.
    - Streaming chat completion with token deltas, thinking deltas, and usage stats.
  - Implemented [`ProviderRegistry`](crates/edith-models/src/registry.rs) providing thread-safe provider registration, retrieval, and concurrent health checks.
- Integrated `edith-models` into `edith-api` and `apps/daemon`:
  - Added `GET /v1/providers` returning live provider health, latency, and available models.
  - Updated `GET /v1/status` to report live provider status.
  - Added startup provider probe in `edith-daemon`.
- Verified test suite:
  - All 13 Rust workspace tests pass (`cargo test --workspace`).
  - Real live Ollama integration test (`test_ollama_live_health_and_completion`) passes against local `qwen3:0.6b`.

---

## [0.1.0] - 2026-11-03

### Phase 0: Repository Audit & Environment Verification
- Completed full audit of existing repository and the 24 Arena.ai design documents.
- Audited Linux host environment (Ubuntu 26.04.1 LTS, AMD Ryzen 5 5600GT APU, GNOME Wayland).
- Verified local Ollama instance (`qwen3:0.6b`, `qwen3:4b`, `qwen2.5:3b-instruct`) and cached Faster-Whisper models.
- Verified and executed prototype test suite (19 tests passing).
- Documented findings in `docs/implementation/REPOSITORY_AUDIT.md` and `docs/implementation/ARCHITECTURE_GAP_ANALYSIS.md`.
- Formulated Architecture Decision Records:
  - `ADR-0001`: Workspace Layout and SQLite Storage Engine Architecture.
  - `ADR-0002`: Dual Transport Daemon (Unix Domain Socket & Loopback TCP).

### Phase 1: Rust Workspace & Application Foundation
- Initialized root Cargo workspace with members:
  - `crates/edith-core`
  - `crates/edith-events`
  - `crates/edith-storage`
  - `crates/edith-api`
  - `apps/daemon`
- Implemented `edith-core`:
  - Domain enums: `TaskState`, `Tier`, `CapabilityKind`, `AutonomyClass`, `Provenance`, `DataClass`, `VerificationMode`, `TaskOrigin`, `TaskPriority`.
  - Type-safe UUIDv7 identifiers (`Id`).
  - Configuration schema with TOML loader and environment path resolution.
  - Core error hierarchy (`EdithError`).
- Implemented `edith-events`:
  - `EventEnvelope` with timestamps, task tracking, trace IDs, and JSON payloads.
  - `EventBus` backed by Tokio broadcast channel with lag detection.
- Implemented `edith-storage`:
  - SQLite storage engine in WAL mode with connection pooling (`r2d2`), synchronous=NORMAL, foreign keys enabled.
  - Embedded migrations (`0001_initial_schema.sql`) for sessions, turns, tasks, task_events, route_decisions, memory_items, and settings.
  - Async repository methods with Tokio blocking thread pool.
- Implemented `edith-api`:
  - Axum HTTP/1.1 and WebSocket router.
  - Endpoints: `GET /v1/health`, `GET /v1/status`, `GET /v1/sessions`, `POST /v1/sessions`, `GET /v1/sessions/{id}/turns`, `POST /v1/sessions/{id}/messages`, `GET /v1/tasks`, `GET /v1/tasks/{id}`, `GET /v1/events` (WebSocket upgrade).
  - Bearer token authentication middleware and CORS support.
- Implemented `apps/daemon` (`edith-daemon`):
  - Composition root initializing tracing, config, storage, event bus, and listeners.
  - Dual transport support: Unix domain socket at `$XDG_RUNTIME_DIR/edith/api.sock` (mode 0600) and Loopback TCP at `127.0.0.1:4242`.
  - Automatic auth token generation and storage in `$XDG_RUNTIME_DIR/edith/token`.
  - Graceful shutdown on `SIGINT` / `SIGTERM` with socket file cleanup.
- Verified test suite:
  - All 9 Rust workspace tests pass (`cargo test --workspace`).
  - Live daemon tested with curl (`/v1/health`, `/v1/status`, session creation, message submission, task verification).
