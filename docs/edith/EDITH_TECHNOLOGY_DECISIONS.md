# EDITH — Technology Decisions

Status legend: **Decided** (adopt for v1), **Provisional** (adopt unless a spike disproves it), **Open** (decision gate with a named test), **Rejected**.

Evidence references point to [RESEARCH](EDITH_RESEARCH_AND_COMPETITOR_ANALYSIS.md) sections.

| ID | Area | Decision | Status | Rationale | Alternatives rejected or deferred | Evidence |
|----|------|----------|--------|-----------|-----------------------------------|----------|
| D1 | Core language | Rust (edition current stable) | Decided | Specification requirement; memory safety; Tokio ecosystem | Python (OpenJarvis-style) for core — rejected for runtime | RESEARCH §1 |
| D2 | Async runtime | Tokio | Decided | De facto standard; required by `rmcp` | async-std — rejected | RESEARCH §3.1 |
| D3 | MCP protocol | Official `rmcp` SDK, wrapped behind `McpClient` | Decided | Official, Tokio-based, implements current spec | Hand-written JSON-RPC — rejected (duplicate effort); forks — rejected | RESEARCH §3.1–3.2 |
| D4 | MCP transports | stdio + Streamable HTTP. No legacy SSE | Decided | Spec status; SDK does not provide legacy | Legacy HTTP+SSE via proxy — deferred | RESEARCH §3.2 |
| D5 | Persistence | SQLite (WAL, sqlx) + FTS5; vector search via sqlite-vec **or** brute-force fallback | Provisional (sqlite-vec open) | Local-first; zero ops | PostgreSQL — deferred (no server mode); LanceDB/Qdrant — rejected for v1 (extra service) | DATABASE §8 |
| D6 | Primary local model | Qwen3 family; exact checkpoint chosen by benchmark (candidates 8B, 14B, 30B-A3B, 32B) | Open — gate: Phase 6 benchmark | Owner's stated primary; Apache-2.0 per distributor; thinking/non-thinking modes | Other families — not evaluated; router is model-agnostic | RESEARCH §5.3 |
| D7 | Tier 1 classifier | Small model via Ollama **or** rules + embedding classifier | Open — gate: Phase 6 | Measure accuracy and latency first | LLM-only — rejected (latency and cost) | MODEL_ROUTING §12 |
| D8 | Audio capture | PipeWire binding first; cpal (ALSA) fallback | Provisional | GNOME default audio server | Pulse-only — rejected | RESEARCH §8 |
| D9 | Desktop shell | Tauri v2 for main, settings and overlay windows; overlay behind trait with three modes | Provisional — gate: Phase 14 Wayland spike | Web UI reuse; Rust backend; Linux support | Electron — rejected (footprint); native GTK/Qt — rejected for UI breadth; GNOME Shell extension — fallback only | RESEARCH §6 |
| D10 | Local ASR | whisper.cpp (ggml) as supervised worker or linked library | Provisional — gate: Phase 11 accuracy and latency | Verified streaming example and HTTP server | faster-whisper (Python) — deferred; Vosk — not evaluated | RESEARCH §7.1 |
| D11 | Cloud ASR | Gemini Live API, opt-in, manual VAD | Provisional (model ID verified at implementation) | Verified WebSocket transcription, custom vocabulary | Other cloud ASR — not evaluated | RESEARCH §7.2 |
| D12 | Secrets | Secret Service (libsecret) with encrypted-file fallback | Provisional | Standard on GNOME | Plain TOML — rejected | SECURITY §8 |
| D13 | Database encryption | Off in v1; SQLCipher or field encryption evaluated Phase 15 | Open | Complexity vs benefit; single-user local | — | MEMORY §8 |
| D14 | Local API | Unix socket, HTTP/JSON, WebSocket events | Decided | No open TCP port | gRPC — deferred (adds codegen for little benefit in v1) | API §1 |
| D15 | Frontend framework | React 18+ with TypeScript, Vite build | Decided | Mature ecosystem; typed; works in Tauri | Svelte, Vue — acceptable but not chosen for team familiarity | FRONTEND §2 |
| D16 | Frontend state | Typed service adapters + React context + a small store (Zustand-class) | Provisional | Simple, testable | Redux — rejected (overhead) | FRONTEND §5 |
| D17 | Styling | CSS custom properties with a tokens file; no utility framework | Decided | Precise control of the design language | Tailwind — deferred | FRONTEND §3 |
| D18 | Inference adapters | Own HTTP adapters for Ollama and llama.cpp servers; Rig as optional backend | Decided (Rig: Provisional) | Keeps core independent of Rig's pre-1.0 API | Rig as only backend — rejected | RESEARCH §2.2 |
| D19 | Skill format | EDITH canonical `skill.toml` + SKILL.md body; Claude Code and OpenCode adapters | Provisional | Matches verified Claude Code SKILL.md and OpenCode `mcp` config | Copy external formats verbatim — rejected | MCP_AND_SKILL §6 |
| D20 | Agent framework | No external agent framework; EDITH orchestrator is native | Decided | Control over state machine and policy | Letta as runtime — rejected; LangChain — rejected (Python) | RESEARCH §2.1 |
| D21 | Observability | `tracing` + JSON lines; OpenTelemetry-compatible names; no external telemetry | Decided | Local-first; future export possible | Cloud telemetry — rejected by default | DETAILED §3.23 |
| D22 | Testing | `cargo test`, `proptest`, recorded fixtures; Playwright for UI E2E | Provisional | Standard tools | — | TESTING |
| D23 | Packaging | `.deb` and AppImage; systemd user service | Provisional | Common on GNOME desktops | Flatpak — evaluated Phase 16 | DEPLOYMENT in HIGH_LEVEL §8 |
| D24 | Prototype build | Vite + React + TypeScript, no backend, mock adapters | Decided | Fast iteration; honest about simulation | — | PROTOTYPE in UI_UX §7 |

## Dependency policy

- Every new dependency needs: licence check (permissive only for distributed code), maintenance signal (release in last 12 months), security advisory check, and a note in this file.
- Pin major versions; update through reviewed pull requests only.
- `cargo deny` enforces licences and banned crates. `cargo audit` runs in CI.

## Open gates (what must be answered and when)

| Gate | Question | Method | Phase |
|------|----------|--------|-------|
| G1 | Which Qwen3 checkpoint meets latency and quality on the owner's machine? | Benchmark 3 checkpoints on 50 requests from the eight scenarios | 6 |
| G2 | Is sqlite-vec stable enough for the memory index? | Benchmark 100k vectors; crash test | 9 |
| G3 | Can the overlay stay on top on GNOME Wayland? | Spike three modes | 14 |
| G4 | Is whisper.cpp accurate enough in English and Bangla? | WER on 60 min owner set | 11 |
| G5 | Is PipeWire echo cancellation adequate for barge-in? | Scripted test with speaker output | 11 |
| G6 | Are Antigravity MCP and skill configurations accessible and stable? | Inspect locally; write adapter spec | 8 |
