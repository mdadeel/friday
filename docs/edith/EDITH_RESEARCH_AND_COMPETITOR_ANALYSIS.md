# EDITH — Research and Competitor Analysis

Research date: 2026-11-03. Method: web search and fetch of project repositories, official documentation and release notes. Each claim carries a classification:

- **Verified** — checked in a primary or near-primary source during this pass.
- **Recommendation** — architectural judgement based on verified facts.
- **Assumption** — not checked; must be validated before reliance.
- **Experimental** — needs a spike.

Where a source is a third-party summary rather than the official documentation, this is stated.

## 1. Open-source "Jarvis" projects

### 1.1 OpenJarvis (open-jarvis/OpenJarvis)

- **What it is:** a local-first personal AI framework, Python-based, Apache-2.0. Positions itself "in the spirit of PyTorch". **Verified** via the GitHub repository page (Apache-2.0; roughly 13k stars at the time of crawl).
- **Architecture (verified from README):** shared primitives for on-device agents; evaluations that treat energy, FLOPs, latency and dollar cost as first-class constraints; a learning loop that uses local trace data. Presets (`chat-simple`, `code-assistant`, `deep-research`, `scheduled-monitor`, morning digests). Built-in agents include `orchestrator`, `native_react`, `operative` (persistent), `native_openhands` (CodeAct), `deep_research`. Node 22+ required for the browser GUI.
- **What EDITH should reuse conceptually:**
  - Trace-driven evaluation with cost and latency as constraints — adopted in [PERFORMANCE_REQUIREMENTS](EDITH_PERFORMANCE_REQUIREMENTS.md) and [TESTING](EDITH_TESTING_AND_EVALUATION_PLAN.md).
  - Named presets as user-facing configuration bundles — adopted as "Profiles" in [UI_UX](EDITH_UI_UX_SPECIFICATION.md).
  - A separate persistent `operative` agent type — mapped to EDITH's long-running task model.
- **What does not fit:** Python runtime as the core (conflicts with P2); agent-per-preset structure (EDITH uses one orchestrator with worker roles); CodeAct execution of arbitrary generated Python (conflicts with the policy model — see [SECURITY](EDITH_SECURITY_AND_AUTONOMY_POLICY.md) §6).
- **Licence / maintenance:** Apache-2.0; active (last update shown Nov 2026). Acceptable for reference; no code reuse planned without review.

### 1.2 OPUSJARVIS (GARDIS0N/OPUSJARVIS)

- **What it is:** a personal manager built on OpenJarvis, with SQLite schedule, daily briefing and accountability features. Apache-2.0. **Verified** from the repository listing.
- **Relevance:** demonstrates the schedule/briefing use case on the OpenJarvis base. Confirms that scheduled, memory-backed briefings are a common user need.
- **Does not fit:** a single-owner, domain-specific app; no reusable architecture beyond what OpenJarvis provides.

### 1.3 Open.Jarvis (dmrr35/Open.Jarvis)

- **What it is:** a Windows-first Python desktop assistant with local command routing, optional Groq cloud fallback, memory privacy controls, plugin permission checks, and a "keyless degraded mode". MIT. **Verified** from the repository README.
- **Useful ideas:**
  - Keyless degraded mode: the assistant keeps working with local rules when cloud providers are missing. Adopted as the Tier 0 fallback requirement in [MODEL_ROUTING](EDITH_MODEL_ROUTING_DESIGN.md) §7.
  - Plugin permission and boundary checks, and safe URL handling — inspiration for the policy engine.
- **Does not fit:** Windows-only, Python, and its UI is a cyber-style dashboard the product brief explicitly rejects.

### 1.4 Other projects noted

- **danush-aries/OpenJarvis (fork-like project, MIT):** claims a learning loop using DSPy, GEPA and SFT, and a Rust native extension for memory indexing. **Verified** only as a README claim; no code reviewed. Treated as an **Experimental** idea source, not a dependency.
- **Open Interpreter, OpenHands:** not verified in this research pass. Their ideas (code execution in sandboxes) are referenced only as general patterns. **Assumption** that they should be re-checked before any code-execution design is finalised.

### 1.5 Conclusion on the Jarvis landscape

Most existing projects are Python-first, Windows-first, or single-purpose. None provides a Rust core with a typed policy engine, MCP as a first-class host, and a four-type memory model together. EDITH's differentiation is in **execution safety, provenance-aware memory and capability-aware routing**, not in the presence of a voice interface.

## 2. Agent frameworks and memory systems

### 2.1 Letta (formerly MemGPT)

- **Verified (secondary sources):** three memory tiers — core (always in-context, editable by the agent), recall (searchable conversation history), archival (vector-searchable long-term store). Agent memory operations are exposed as tool calls (`core_memory_append`, `core_memory_replace`, `archival_memory_insert`, `archival_memory_search`). Sources: Letta research summaries and the MemGPT paper (see §8).
- **Adopted ideas:**
  - Tiering by prompt cost — adopted in [MEMORY](EDITH_MEMORY_ARCHITECTURE.md) (core block = "working memory pinned facts").
  - Memory writes as explicit, auditable tool calls — adopted: memory writes go through `memory.propose` with provenance.
  - Sleep-time consolidation (background reorganisation) — adopted as a later-phase idea.
- **Rejected:** Letta as a runtime. It is a Python service with its own agent model; running it beside the Rust daemon adds a process and a second source of truth (conflicts with P1 and the "avoid unnecessary microservices" rule).
- **Licence:** **Assumption** that the Letta core is Apache-2.0; to be verified before any code reuse.

### 2.2 Rig (0xPlaygrounds/rig)

- **Verified:** Rust library for LLM applications with provider abstractions and companion crates for vector stores (the fork README lists `rig-sqlite`, `rig-lancedb`, `rig-qdrant` among others). MIT licence (third-party index). Project is pre-1.0 and changes quickly; a minimum supported Rust version is published.
- **Use in EDITH:** candidate **adapter implementation** behind EDITH's own `ModelProvider` trait, not the trait owner. Rationale: EDITH must own its abstractions to keep the agent runtime independent of any framework (P3, P4).
- **Risk:** pre-1.0 API churn. Mitigation: pin version, wrap in `edith-models` feature `rig-backend`, keep an in-house HTTP adapter for Ollama and llama.cpp so the core path does not depend on Rig.

### 2.3 Other agent-framework references

- **LangChain / LlamaIndex:** Python; referenced for common patterns only. Not evaluated in depth; **Assumption**.
- **Anthropic's Agent Skills format:** see §4.

## 3. MCP ecosystem

### 3.1 Official Rust SDK — rmcp (modelcontextprotocol/rust-sdk)

- **Verified:** official Rust SDK with a Tokio async runtime; crates `rmcp` and `rmcp-macros`; the README states it implements the stable 2026-07-28 specification and remains compatible with 2025-11-25 and earlier. Supports client and server features, tasks, sampling, roots, completions, caching, and stateless Streamable HTTP. It explicitly does **not** provide the legacy HTTP+SSE transport (2024-11-05).
- **Verified:** `rmcp` features are enabled per use (`server`, client features); the project publishes a migration guide between major versions. Version 3.x is referenced in the current README; forks show older 0.x and 1.x numbers.
- **Recommendation:** adopt `rmcp` as the MCP protocol implementation in `edith-mcp`. Pin a version at implementation time; expect breaking changes; isolate the SDK behind an internal `McpClient` trait.
- **Caveat:** several forks exist (warpdotdev, CosmicMind, others). Use only the upstream `modelcontextprotocol` organisation.

### 3.2 Transports

- **Verified (MCP spec):** two standard transports — **stdio** and **Streamable HTTP**. Clients should support stdio whenever possible. HTTP+SSE (2024-11-05) is deprecated.
- **Recommendation:** EDITH supports stdio (local child processes launched by the daemon) and Streamable HTTP (remote servers, with auth headers). No legacy SSE.

### 3.3 Configuration formats in the wild

- **OpenCode (verified from official docs):** `opencode.json` with an `mcp` object. Local servers use `"type": "local"` with a `command` array and optional `environment`; remote servers use `"type": "remote"` with `url`, optional `headers`, and optional `oauth`. Per-tool permissions use glob keys (for example `"my-mcp*": false`).
- **Claude Code (verified from official docs):** skills live in `.claude/skills/<name>/SKILL.md`; the Agent SDK loads skills from configured setting sources. MCP is configured through Claude Code's own settings (format not reviewed in detail in this pass — **Assumption** that it is JSON with `mcpServers`).
- **Antigravity:** **not verified**. The adapter is deferred until the owner's installed configuration is inspected locally.

## 4. Skill formats

- **Verified (Claude Code docs):** a skill is a directory with a `SKILL.md` file containing YAML frontmatter and Markdown instructions. Recognised fields include `name`, `description`, `when_to_use`, `allowed-tools`, `disable-model-invocation`, `user-invocable`, `context`, `paths`, `model`, `effort`. Descriptions are always in context; bodies load on use. Combined `description` and `when_to_use` are truncated in the listing at 1,536 characters.
- **Verified (open standard, third-party summary):** Agent Skills are published as an open standard (agentskills.io, per a secondary source). Constraints cited: `name` ≤ 64 characters, lowercase letters, digits and hyphens, matching the folder name; `description` ≤ 1,024 characters.
- **Verified (third-party summary):** the same folder is read by several agents, including OpenCode and Copilot, from `.claude/skills` or `.agents/skills`. Treated as **Assumption** until checked in OpenCode's docs.
- **Critical observation (verified in Claude Code docs):** skill rules are instructions, not guardrails. EDITH's model therefore separates instruction content from enforced permissions.

## 5. Model runtimes

### 5.1 Ollama

- **Verified (secondary and official-derived sources):** exposes native endpoints (`/api/chat`, `/api/generate`, `/api/tags`) and an OpenAI-compatible surface under `/v1` (`/v1/chat/completions`, `/v1/embeddings`, `/v1/models`, `/v1/responses`). Default port 11434. Tool calling is supported through the `tools` parameter; support depends on the model.
- **Recommendation:** primary local runtime for Tier 1 and Tier 2 in v1. Use the OpenAI-compatible endpoint behind EDITH's own adapter.

### 5.2 llama.cpp

- **Verified (project README):** C/C++ inference with GGUF models; a server mode is available and was used by the Qwen3 GGUF releases referenced below. **Assumption** on the exact server flags; to be checked in the spike.
- **Recommendation:** second adapter, used when the owner needs fine control of quantisation or GPU offload. Same `ModelProvider` contract.

### 5.3 Qwen3 (the "primary experimental" checkpoint)

- **Verified (Hugging Face collection and model card):** the Qwen3 family includes dense models at 0.6B, 1.7B, 4B, 8B, 14B and 32B parameters and MoE models 30B-A3B and 235B-A22B. Base and instruct variants exist. Quantised GGUF, AWQ, GPTQ and MLX releases are published.
- **Verified:** the Qwen3 card describes a switch between a thinking mode (for maths and code) and a non-thinking mode (for fast chat) inside the chat template.
- **Verified (third-party vendor summary):** Qwen3 is licensed Apache-2.0 per the download page; **check the official model card at adoption**.
- **Contradiction noted:** a download page lists 128K context for larger models; the Hugging Face model card for 0.6B lists 32,768 tokens. Context length must be read from the specific checkpoint's configuration at benchmark time.
- **Vendor claim (unverified):** Qwen3 "supports MCP in the model" and "strong agent skills" per a community post. Treated as **Assumption**; EDITH does not depend on it — the MCP host is outside the model.
- **Decision:** the exact checkpoint is an open decision (A1 in [PRODUCT_VISION](EDITH_PRODUCT_VISION.md)).

### 5.4 Other local model candidates

Not evaluated in this pass: other open-weight families. The router is designed so any model with an OpenAI-compatible or GGUF endpoint can be registered.

## 6. Desktop shell

### 6.1 Tauri v2

- **Verified (Tauri configuration docs, secondary summaries):** window options include `transparent`, `decorations`, `alwaysOnTop`, `skipTaskbar`, `shadow`, and window effects (for example `mica` on Windows).
- **Verified (tao issue #1134):** `with_always_on_top(true)` does not keep the window above windows focused from behind on Wayland; it works under XWayland or with `WAYLAND_DISPLAY=""`. Reported on GNOME 48.
- **Verified (Tauri issue #14019):** on Linux, multi-monitor overlay windows opened on the primary monitor despite explicit positioning. Reported with Tauri 2.
- **Verified (developer report, 2026):** selective click-through is not exposed by Tauri as per-region hit testing; a workaround polls the cursor and toggles `setIgnoreCursorEvents`. CSS `backdrop-filter` blur was reported as not working over transparent windows in that case (Windows context).
- **Recommendation:** Tauri v2 for the desktop shell (settings window, main window, overlay window). Evaluate native alternatives only for the overlay, behind a trait (see [TECHNOLOGY_DECISIONS](EDITH_TECHNOLOGY_DECISIONS.md) D9).

### 6.2 Native alternatives (for the overlay only)

- **Assumption:** GNOME Shell does not implement the wlr-layer-shell protocol used by many Wayland overlay tools; a GNOME Shell extension is the only fully native always-on-top route. Requires a spike.
- **Recommendation:** three overlay modes — layer surface where supported, XWayland always-on-top window, plain window with a "keep on top" hint documented as best-effort.

## 7. Speech

### 7.1 Whisper and whisper.cpp

- **Verified (whisper.cpp README):** C/C++ port of Whisper with a `stream` example for real-time microphone transcription, which samples audio every 500 ms by default in the sample. An HTTP `server` example with an "OAI-like API" is listed.
- **Verified:** models are distributed in ggml format; the download script fetches `base.en` and others.
- **Recommendation:** whisper.cpp as the default local ASR through a `SpeechRecognizer` trait; run as a supervised child process or a linked library behind a feature flag.
- **Licence:** **Assumption** MIT (commonly stated); verify before distribution.

### 7.2 Gemini Live API (cloud)

- **Verified (Google AI developer docs):** WebSocket bidirectional session (`BidiGenerateContent`). Input audio is streamed as PCM at 16 kHz (`audio/pcm;rate=16000`). Input transcription is enabled with `inputAudioTranscription`; the server emits `interimInputTranscription` (low-latency, may change) and `inputTranscription` (final for the segment). Options include `languageCodes`, `customVocabulary`, `mode` (`VERBATIM` or `SMART`). Automatic voice activity detection can be disabled, in which case the client sends `activityStart` and `activityEnd` (push-to-talk) or `audioStreamEnd`.
- **Verified:** transcription and voice features in the docs are documented against specific preview or newer model identifiers; **the model ID must be read from configuration and verified at implementation time** (A3).
- **Privacy:** audio leaves the device. Opt-in only.
- **Recommendation:** implement the Gemini adapter as a `SpeechRecognizer` alternative for later phases (Phase 11). Use manual VAD (push-to-talk signals) for predictable boundaries.

### 7.3 Voice activity detection and speech output

- **Assumption:** Silero VAD (ONNX) is a commonly used open VAD model; licence and ONNX Runtime integration must be verified. Candidate for endpointing.
- **Assumption:** Piper and similar local TTS engines are candidates for speech output. Not evaluated in this pass.

## 8. Audio capture

- **Assumption:** PipeWire is the default audio server on GNOME. Two Rust routes exist: a `pipewire` crate binding and `cpal` (ALSA backend, with PipeWire compatibility on many distributions). Benchmark both in Phase 11.

## 9. Search

- **Assumption:** SearXNG (self-hostable metasearch) is a candidate for a privacy-preserving default search provider. Not verified in this pass.
- **Assumption:** tantivy (Rust full-text search engine) is a candidate for local document search. Not verified in this pass.
- **Recommendation:** search providers implement a `SearchProvider` trait; no provider is hard-wired.

## 10. Conclusions for EDITH

| Question | Finding | Consequence |
|----------|---------|-------------|
| Is there a Rust, local-first, policy-governed personal agent? | No mature one found | EDITH builds the core; reuses protocols and models |
| Is MCP viable in Rust? | Yes, official SDK | `rmcp` in `edith-mcp` |
| Are skills portable? | Partly; format is shared, enforcement is not | Typed skill model with adapters |
| Can local models run the MVP? | Yes for simple tiers; complex planning uncertain | Tiered router with escalation and quality flags |
| Can the overlay be always-on-top on GNOME Wayland? | Unreliable | Three overlay modes; risk R6 |
| Is Rig a safe foundation? | Useful but pre-1.0 | Adapter, not trait owner |
| Is Letta usable directly? | It is a separate service; ideas are useful | Adopt concepts, not runtime |

## 11. Sources

Repositories and documents consulted in this pass:

1. OpenJarvis — https://github.com/open-jarvis/OpenJarvis (Apache-2.0, 2026 README, arXiv 2605.17172 cited therein)
2. OpenJarvis project organisation — https://github.com/open-jarvis
3. OPUSJARVIS — https://github.com/GARDIS0N/OPUSJARVIS
4. Open.Jarvis (Windows) — https://github.com/dmrr35/Open.Jarvis
5. Danush-Aries/OpenJarvis fork — https://github.com/Danush-Aries/OpenJarvis
6. Official MCP Rust SDK (rmcp) — https://github.com/modelcontextprotocol/rust-sdk
7. MCP specification, transports (2025-03-26 page) — https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/
8. Letta / MemGPT research summaries — https://lin-guanguo.github.io/llm-memory-research/letta.research/ and https://seekvana.com/library/agentic-ai/memory-research-memgpt-letta-sleep-time
9. Rig — https://github.com/0xplaygrounds/rig (via https://context7.com/0xplaygrounds/rig) and https://github.com/aomi-labs/rig (fork listing of companion crates)
10. Claude Code skills (Agent SDK) — https://code.claude.com/docs/en/agent-sdk/skills
11. Claude Code skills guide (third-party) — https://www.mdskills.ai/learn/how-to-create-a-claude-code-skill
12. Agent Skills format summary (third-party) — https://www.gekkode.com/en/intelligence-artificielle/agent-skills-skill-md-guide-en/
13. OpenCode MCP servers — https://dev.opencode.ai/docs/mcp-servers/ and https://docs.opencode.ai/docs/mcp-servers/
14. Ollama OpenAI-compatible API (third-party summaries) — https://eastondev.com/blog/en/posts/ai/ollama-api-calls/ and https://www.promptquorum.com/local-llms/local-llm-openai-compatible-api
15. Qwen3 collection — https://huggingface.co/collections/Qwen/qwen3
16. Qwen3-0.6B model card — https://huggingface.co/Qwen/Qwen3-0.6B
17. Qwen3 release post (community) — https://huggingface.co/posts/merterbak/337137510653930
18. Qwen3 download summary — https://qwen-3.com/en/download
19. Gemini Live transcription — https://ai.google.dev/gemini-api/docs/live-api/live-transcribe
20. Gemini Live API WebSocket reference — https://ai.google.dev/api/live
21. whisper.cpp — https://github.com/ggml-org/whisper.cpp (v1.6.2 and v1.7.2 pages)
22. Tauri window configuration — https://techxcelerate.ntxm.org/docs/tauri/configuration/window-configuration/ (secondary)
23. tao issue #1134, Wayland always-on-top — https://github.com/tauri-apps/tao/issues/1134
24. Tauri issue #14019, multi-monitor overlay on Linux — https://github.com/tauri-apps/tauri/issues/14019
25. Tauri overlay developer report — https://dev.to/manasightgg/why-i-chose-tauri-v2-for-a-desktop-overlay-in-2026-597h
