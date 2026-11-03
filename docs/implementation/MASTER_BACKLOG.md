# EDITH 2.0 — Engineering Master Backlog
**Tracking Document for Milestones & Tasks**

---

## Epic 1: Rust Workspace & Foundation (Phase 1)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-101** | `Cargo.toml` | Root workspace configuration with members and shared dependency profiles | **Completed** | `cargo metadata` parses cleanly |
| **TSK-102** | `edith-core` | Shared domain types (`TaskState`, `Tier`, `CapabilityKind`, `AutonomyClass`, `Provenance`, `DataClass`, UUIDv7 IDs, Configuration structs) | **Completed** | Serde round-trip unit tests pass |
| **TSK-103** | `edith-events` | In-process typed event bus using Tokio broadcast with lag detection and envelopes | **Completed** | Multiple subscriber and lag handling tests pass |
| **TSK-104** | `edith-storage` | SQLite storage engine in WAL mode, embedded migrations (`0001_initial_schema.sql`), connection pool (`r2d2`), task & event repositories | **Completed** | In-memory and file-based SQLite tests pass |
| **TSK-105** | `edith-api` | Axum HTTP and WebSocket API server, `/v1/health`, `/v1/status`, bearer token middleware, CORS | **Completed** | HTTP endpoint integration tests pass |
| **TSK-106** | `apps/daemon` | Composition root, configuration loading (`edith.toml`), lifecycle management, signal handling (`SIGINT`, `SIGTERM`), dual Unix/TCP sockets | **Completed** | Daemon boots cleanly, initializes DB, and gracefully shuts down |

---

## Epic 2: Model Providers & Inference (Phase 2)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-201** | `edith-models` | Define `ModelProvider` trait, request/response structures, streaming tokens, error types | **Completed** | Mock provider tests pass |
| **TSK-202** | `edith-models` | Implement Ollama adapter connecting to `http://127.0.0.1:11434` supporting local Qwen models | **Completed** | Live integration test with local Ollama passes |
| **TSK-203** | `edith-models` | Capability detection, token counting, Qwen3 thinking extraction, timeout handling | **Completed** | Real Qwen3 response evaluated with thinking extracted |
| **TSK-204** | `edith-models` | Thread-safe `ProviderRegistry` with parallel health check auditing | **Completed** | Concurrent health checks verify all providers |

---

## Epic 3: Conversation Engine (Phase 3)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-301** | `edith-storage` | Migration `0002_add_thinking_to_turns.sql`, sessions and turns repository with full CRUD, cascade cleanup | **Completed** | Repository CRUD & migration tests pass |
| **TSK-302** | `edith-api` | Session and turn endpoints: `GET/POST /v1/sessions`, `GET/PATCH/DELETE /v1/sessions/{id}`, `GET/PATCH/DELETE /v1/sessions/{id}/turns/{turn_id}`, `POST /v1/sessions/{id}/messages` | **Completed** | API integration tests pass |
| **TSK-303** | `edith-api` | Asynchronous streaming conversation worker (`process_conversation`) with `CancellationToken` cancellation and `POST /v1/sessions/{id}/cancel` | **Completed** | In-flight cancellation verified |
| **TSK-304** | `edith-daemon` | Streaming response delivery via WebSocket (`message.delta`, `message.final`) and live Qwen3 chat verification | **Completed** | Live stream and thinking persistence verified |

---

## Epic 4: Agent Runtime & Orchestration (Phase 4)

| Task ID | Component | Description | Status | Verification Criteria |
| **TSK-401** | `edith-agent` | Task state machine (`discovered` -> `planning` -> `executing` -> `verifying` -> `completed` / `failed`) | **Completed** | State transition unit tests pass |
| **TSK-402** | `edith-agent` | Context builder assembling working context, user preferences, and token-bounded history | **Completed** | Token budget bounded context tests pass |
| **TSK-403** | `edith-agent` | Plan generation and wave execution loop with dependency solver | **Completed** | Multi-step mock plan execution passes |
| **TSK-404** | `edith-agent` | Verification engine enforcing mechanical, evidence-based, or user-confirmed gates | **Completed** | Verification failure stops execution before completion |

---

## Epic 5: Intelligent Model Routing (Phase 5)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-501** | `edith-router` | Deterministic Tier 0 matcher (local system time, date, math, status without model) | **Completed** | Unit tests pass on deterministic patterns |
| **TSK-502** | `edith-router` | Complexity classifier mapping objectives to Tiers (T0-T4) | **Completed** | Benchmark routing tests match Arena specs |
| **TSK-503** | `edith-router` | Fallback escalation chain (T1 fast local -> T2 reasoning local -> T3/T4 cloud) | **Completed** | Fallback chain generation verified |
| **TSK-504** | `edith-router` | Audit route decision persistence in `route_decisions` table | **Completed** | SQLite audit record verified |

---

## Epic 6: Tool & MCP Infrastructure (Phase 6)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-601** | `edith-tools` | Unified `Tool` trait, parameters schema validation, permissions model, execution result types | **Completed** | Trait and schema unit tests pass |
| **TSK-602** | `edith-tools` | Core native built-in tools: `fs.read_file`, `fs.write_file`, `fs.list_dir`, `system.execute_command`, `datetime.now` | **Completed** | Sandboxed execution & path containment tests pass |
| **TSK-603** | `edith-tools` | Tool registry: thread-safe registration, discovery, schema export for LLM function calling | **Completed** | Registry resolution & schema export tests pass |
| **TSK-604** | `edith-mcp` | Model Context Protocol (MCP) client connecting via stdio JSON-RPC | **Completed** | Protocol serialization and client lifecycle tests pass |
| **TSK-605** | `edith-agent` | Wire Tool Registry into `ExecutionEngine`, replacing step mock dispatch with real tool invocation | **Completed** | Real tool dispatch executed and verified in test suite |

---

## Epic 7: Persistent Memory (Phase 7)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-701** | `edith-storage` | Migration `0003_memory_enhancements.sql` for semantic, episodic, procedural, and working memory | **Completed** | Database migration executes cleanly |
| **TSK-702** | `edith-memory` | Provenance classification engine (explicit, inferred, temporary, assumption, secret gatekeeper) | **Completed** | Unit tests verify provenance rejection/acceptance rules |
| **TSK-703** | `edith-memory` | Memory facade service coordinating working scratchpad, episodic recalls, and semantic facts | **Completed** | Memory CRUD & search unit tests pass |
| **TSK-704** | `edith-agent` | ContextBuilder integration: inject accepted semantic facts & episodic memories within token budgets | **Completed** | ContextBuilder tests pass with memory injection |
| **TSK-705** | `edith-api` | Memory management endpoints (`GET /v1/memory/items`, `POST /v1/memory/items`, `PATCH /v1/memory/items/{id}`, `DELETE /v1/memory/items/{id}`) | **Completed** | API integration tests pass |

---

## Epic 8: Voice Engine (Phase 8)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-801** | `edith-voice` | Audio buffer and capture abstraction (16 kHz mono ring buffer, PCM frames) | **Completed** | Audio ring buffer and framing tests pass |
| **TSK-802** | `edith-voice` | VAD (Voice Activity Detection) state machine (`Idle` -> `Listening` -> `Thinking` -> `Speaking`) with mic privacy guarantees | **Completed** | State machine transitions and mic closure verified |
| **TSK-803** | `edith-voice` | ASR pipeline abstraction with Whisper/faster-whisper inference or local transcription provider | **Completed** | Transcription tests pass with audio sample |
| **TSK-804** | `edith-voice` | TTS pipeline abstraction for speech synthesis with streaming audio frames and sentence segmenter | **Completed** | Speech generation interface verified |
| **TSK-805** | `edith-api` | Voice session management, audio stream intake, and voice event broadcasting (`voice.state_changed`, `voice.transcription`) | **Completed** | API voice session and WebSocket events verified |

---

## Epic 9: Search & Research Infrastructure (Phase 9)

| Task ID | Component | Description | Status | Verification Criteria |
|---------|-----------|-------------|--------|-----------------------|
| **TSK-901** | `edith-search` | Search provider trait and result representation (`SearchResult`, snippets, URLs, engine metadata) | Planned | Unit tests for search models and results pass |
| **TSK-902** | `edith-search` | DuckDuckGo / SearXNG search engine adapter with rate limiting and timeout management | Planned | Search integration tests return structured results |
| **TSK-903** | `edith-search` | Web page content extractor and reader (HTML -> clean markdown / plain text, readable text extraction) | Planned | Extraction tests against real/fixture HTML pass |
| **TSK-904** | `edith-tools` | Register search and web fetch capabilities (`web.search`, `web.fetch`) into `ToolRegistry` with `PolicyEngine` controls | Planned | Security policy blocks private LAN / local IP targets |
| **TSK-905** | `edith-api` | Search endpoints (`POST /v1/search`, `POST /v1/search/fetch`) and research task orchestration | Planned | API integration tests pass |


