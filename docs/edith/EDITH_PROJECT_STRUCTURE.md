# EDITH — Project Structure

Companion: [HIGH_LEVEL_ARCHITECTURE](EDITH_HIGH_LEVEL_ARCHITECTURE.md) §4 · [DETAILED_SYSTEM_DESIGN](EDITH_DETAILED_SYSTEM_DESIGN.md) · [IMPLEMENTATION_ROADMAP](EDITH_IMPLEMENTATION_ROADMAP.md)

## 1. Target repository layout

This layout is the **target** for the Rust implementation. The current repository holds the design documents and the web prototype only.

```text
friday/
├── Cargo.toml                    # workspace
├── crates/
│   ├── edith-core/               # domain types, IDs, errors, config schema
│   ├── edith-events/             # typed in-process event bus
│   ├── edith-observability/      # tracing setup, metrics, redaction
│   ├── edith-storage/            # SQLite, migrations, repositories
│   ├── edith-policy/             # policy engine (pure), audit chain
│   ├── edith-memory/             # memory engine, extraction, retrieval
│   ├── edith-models/             # ModelProvider trait, Ollama and llama.cpp adapters
│   ├── edith-router/             # model router, tiers, health, decision records
│   ├── edith-tools/              # native tools, command templates
│   ├── edith-mcp/                # MCP host on rmcp
│   ├── edith-skills/             # skill registry, adapters
│   ├── edith-search/             # search providers, fetch, extraction, evidence
│   ├── edith-context/            # opt-in environment sources
│   ├── edith-voice/              # capture, VAD, ASR/TTS traits, adapters
│   ├── edith-orchestrator/       # task lifecycle, planner, workers, conversation
│   ├── edith-api/                # local API (axum), contracts, JSON schema export
│   └── edith-testkit/            # fakes: model, MCP server, search, audio fixtures
├── apps/
│   ├── daemon/                   # edith-daemon binary (composition root)
│   ├── cli/                      # edith CLI (status, tasks, memory export)
│   └── desktop/                  # Tauri shell
│       ├── src-tauri/            # Rust side: windows, tray, shortcuts, overlay modes
│       └── ui/                   # TypeScript UI (see prototype/ for the current design)
├── packages/
│   └── contracts/                # TypeScript types generated from Rust JSON Schema
├── prototype/                    # web prototype (simulated, no backend)
├── fixtures/                     # small, licence-clean fixtures (no personal audio)
├── docs/
│   └── edith/                    # this blueprint
├── deploy/                       # systemd user unit, desktop entry, packaging
└── .github/workflows/            # CI
```

Current state: `docs/edith/` and `prototype/` exist. Everything else is planned.

## 2. Crate responsibilities

For each crate: **Why it exists · Owns · Must not own · Depends on · Exposes**.

### 2.1 `edith-core`
- **Why:** shared vocabulary; no behaviour beyond validation.
- **Owns:** IDs, `TaskState`, `Tier`, `CapabilityKind`, `AutonomyClass`, `Provenance`, `DataClass`, error roots, config structs and validation.
- **Must not own:** I/O, async runtime, any provider or storage code.
- **Depends on:** `serde`, `uuid`, `thiserror`, `chrono`. Nothing internal.
- **Exposes:** types only.

### 2.2 `edith-events`
- **Why:** decouple producers and consumers inside the daemon.
- **Owns:** `EventEnvelope`, `EventKind`, bus with broadcast and bounded queues, lag handling.
- **Must not own:** event persistence (that is the orchestrator's job via storage) or UI protocol.
- **Depends on:** `edith-core`, `tokio`.
- **Exposes:** `EventBus::publish`, `subscribe(filter)`.

### 2.3 `edith-observability`
- **Why:** consistent tracing and metrics across crates.
- **Owns:** subscriber setup, span conventions, metrics registry, redaction layer, log rotation.
- **Must not own:** business logic or telemetry export by default.
- **Depends on:** `edith-core`, `tracing`, `tracing-subscriber`.
- **Exposes:** `init(config)`, `redact(&str)`, metrics handles.

### 2.4 `edith-storage`
- **Why:** single place for SQL and migrations.
- **Owns:** connection pool, writer task, migrations, repositories for each area in [DATABASE](EDITH_DATABASE_DESIGN.md) §2, backup.
- **Must not own:** decisions about what to store (callers decide), memory ranking, policy evaluation.
- **Depends on:** `edith-core`, `sqlx`.
- **Exposes:** repository traits per area; `Storage::open(path)`.

### 2.5 `edith-policy`
- **Why:** a single authority for allowing side effects.
- **Owns:** rule model, evaluator, decision records, approval state, audit chain (hash computation).
- **Must not own:** execution, I/O, UI.
- **Depends on:** `edith-core`. The store is accessed through a trait implemented by `edith-storage`.
- **Exposes:** `evaluate(request, rules, ctx) -> Decision` (pure), `AuditSink` trait.

### 2.6 `edith-memory`
- **Why:** structured, provenance-aware memory separate from models.
- **Owns:** memory model, extraction pipeline, write gate, contradiction detection, ranking, consolidation jobs.
- **Must not own:** conversation transcripts (conversation manager), model calls (uses `edith-models` through a trait for extraction).
- **Depends on:** `edith-core`, `edith-storage`, `edith-models` (trait only), `edith-events`.
- **Exposes:** `MemoryService` (search, propose, confirm, edit, delete, review).

### 2.7 `edith-models`
- **Why:** vendor independence.
- **Owns:** `ModelProvider` trait, request/response types, adapters (Ollama, llama.cpp, OpenAI-compatible cloud), connection pooling, error mapping.
- **Must not own:** routing decisions, prompts for tasks, memory.
- **Depends on:** `edith-core`, `reqwest`, `futures`.
- **Exposes:** `ProviderRegistry`, `ModelProvider`, `ModelCapabilities`.

### 2.8 `edith-router`
- **Why:** cost, latency and privacy trade-offs in one place.
- **Owns:** tier model, intent patterns for T0, classifier interface, decision function, health table, fallback chains, decision records.
- **Must not own:** provider HTTP details, execution of tools.
- **Depends on:** `edith-core`, `edith-models` (types and health), `edith-storage` (decision records via trait).
- **Exposes:** `Router::decide(step, ctx) -> RouteDecision`.

### 2.9 `edith-tools`
- **Why:** deterministic and native capabilities with typed schemas.
- **Owns:** `Tool` trait, registry, native tools (`clock`, `calc`, `system`, `fs`, `git`), command template runner, output capture.
- **Must not own:** policy decisions (calls `edith-policy`), MCP protocol.
- **Depends on:** `edith-core`, `edith-policy` (trait), `tokio::process`.
- **Exposes:** `ToolRegistry`, `ToolInvocation`, `ToolResult`.

### 2.10 `edith-mcp`
- **Why:** first-class MCP host.
- **Owns:** `McpClient` trait, `rmcp`-based implementation, server registry, lifecycle supervisor, catalogue cache, call recording.
- **Must not own:** skill selection or policy.
- **Depends on:** `edith-core`, `edith-tools` (capability types), `edith-policy` (trait), `rmcp`.
- **Exposes:** `McpRegistry`, `McpServerHandle`.

### 2.11 `edith-skills`
- **Why:** reusable, versioned instructions and their bindings to tools.
- **Owns:** manifest model, adapters (`native`, `claude-code`, `opencode`), validation, hash pinning, selection index.
- **Must not own:** executing tools (it declares requirements only).
- **Depends on:** `edith-core`, `edith-mcp` and `edith-tools` (for requirement resolution), `edith-storage`.
- **Exposes:** `SkillRegistry`, `SkillSelector`, `CapabilitySourceAdapter`.

### 2.12 `edith-search`
- **Why:** research as a verifiable pipeline.
- **Owns:** search provider trait and adapters, query planning, fetch with limits, extraction, span IDs, evidence and verification helpers.
- **Must not own:** the decision to research (orchestrator), answer generation (uses `edith-models`).
- **Depends on:** `edith-core`, `edith-models` (trait), `edith-storage` (cache), `reqwest`.
- **Exposes:** `SearchService`, `SearchProvider`, `EvidenceSet`.

### 2.13 `edith-context`
- **Why:** optional environment awareness, opt-in and transparent.
- **Owns:** context source trait, git and project sources, collection log, snapshot model.
- **Must not own:** continuous collection loops (collection is triggered), screen or keyboard capture (prohibited).
- **Depends on:** `edith-core`, `edith-storage`, `edith-policy`.
- **Exposes:** `ContextService::collect(sources, purpose) -> Vec<ContextSnapshot>`.

### 2.14 `edith-voice`
- **Why:** voice as an independent subsystem.
- **Owns:** voice session state machine, capture, VAD, ASR and TTS traits, barge-in controller, adapters (whisper.cpp worker, Gemini Live, TTS engine).
- **Must not own:** reasoning, task decisions, storage of audio.
- **Depends on:** `edith-core`, `edith-events`, `cpal` or `pipewire` binding, `reqwest`/WebSocket client for cloud.
- **Exposes:** `VoiceService`, `SpeechRecognizer`, `SpeechSynthesizer`.

### 2.15 `edith-orchestrator`
- **Why:** owns objectives and their lifecycle.
- **Owns:** task state machine, planner, worker pool, budgets, checkpoints, cancellation tree, conversation manager (sessions, turns, context assembly).
- **Must not own:** model HTTP, tool implementations, storage schema.
- **Depends on:** nearly all service crates through traits.
- **Exposes:** `Orchestrator::submit`, `TaskHandle`, `ConversationService`.

Note: the conversation manager sits in this crate for v1 to avoid an extra boundary. It can be split when it grows (decision rule: split when a second frontend needs sessions without tasks).

### 2.16 `edith-api`
- **Why:** the only external interface.
- **Owns:** HTTP routes, WebSocket/SSE event stream, request validation, error mapping, JSON Schema export.
- **Must not own:** business logic (delegates to services).
- **Depends on:** `edith-core`, `edith-events`, service traits, `axum`.
- **Exposes:** `ApiServer::serve(socket, services)`.

### 2.17 `edith-testkit`
- **Why:** deterministic tests across crates.
- **Owns:** fake model provider, fake search provider, fake MCP server, in-memory storage, audio fixture player, clock control.
- **Must not own:** production behaviour; is a dev-dependency only.

### 2.18 `apps/daemon`
- Composition root: builds services in the order in [DETAILED_SYSTEM_DESIGN](EDITH_DETAILED_SYSTEM_DESIGN.md) §2. Handles signals and supervisors. No business logic.

### 2.19 `apps/desktop`
- Tauri shell. Rust side handles windows, tray, shortcut, overlay mode detection, autostart. UI side is the React application. Talks to the daemon only through the local API.

### 2.20 `apps/cli`
- Thin client over the local API for scripting and tests: `edith status`, `edith tasks list`, `edith memory export`.

### 2.21 `packages/contracts`
- TypeScript types generated from the daemon's JSON Schema. The prototype's hand-written contracts are the first draft of this package.

## 3. Dependency rules

1. Dependencies flow downward: apps → orchestrator → capabilities → foundation. No cycles (enforced by `cargo deny` / a workspace graph check in CI).
2. Crates depend on **traits** for peer services when the relationship is runtime-only (for example `edith-policy` is consumed by `edith-tools` via `PolicyGate`).
3. `edith-core` depends on nothing internal.
4. Only `edith-models` and `edith-voice` know about HTTP providers' wire formats (plus `edith-search` for search APIs and `edith-mcp` for MCP).
5. No crate other than `edith-tools` spawns processes; `edith-mcp` spawns MCP children through `edith-tools`' process runner.

## 4. Frontend structure (`prototype/` now, `apps/desktop/ui` later)

```text
prototype/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx                   # routes, shell
    ├── styles/                   # tokens.css, base.css, components.css, screens.css
    ├── types/contracts.ts        # DTOs shared with daemon contract
    ├── services/
    │   ├── contracts.ts          # service interfaces
    │   ├── ServiceProvider.tsx   # context
    │   └── mock/                 # simulated adapters (labelled)
    ├── data/seed.ts              # demo data (all labelled simulated)
    ├── components/               # shared UI
    └── screens/                  # one folder per main screen
```

## 5. Build and tooling

- Rust: stable toolchain pinned in `rust-toolchain.toml`; `rustfmt`, `clippy -D warnings`, `cargo deny`, `cargo audit`.
- TypeScript: `tsc --noEmit`, ESLint, Prettier, Vitest, Playwright.
- Make targets or `just` recipes for common tasks.
- Commit conventions: Conventional Commits; one subsystem per pull request where practical.

## 6. Growth rules

- Create a new crate only when: a boundary has a distinct owner, a second consumer exists or is planned, or its dependency set is heavy enough to affect compile times of others.
- A new external process requires an entry in [HIGH_LEVEL_ARCHITECTURE](EDITH_HIGH_LEVEL_ARCHITECTURE.md) §1 and a failure-mode analysis.
