# EDITH — Product Vision

Status: Draft v1 · Owner: EDITH core team · Companion documents: all `EDITH_*.md` in this folder (index: [README.md](README.md))

## 1. What EDITH is

EDITH is a persistent, local-first personal AI system that runs on the owner's Linux desktop. It accepts text and voice objectives, decides how to accomplish them, uses models and tools to do the work, checks the result, remembers what matters, and reports back.

EDITH is an **agent runtime with a personal memory**, not a chat window. A chat window is one of several surfaces onto that runtime.

The JARVIS reference is used only for the *behaviours* it implies: situational awareness, initiative, execution, and brevity. Every behaviour below is tied to a concrete mechanism in this blueprint. Nothing is implied that has no implementation path.

## 2. Problem statement

Personal AI assistants today fail in predictable ways:

1. They answer questions but do not finish work (the user copies results into other tools).
2. They forget the user between sessions, or remember everything without understanding it.
3. They send every request to the largest model, which is slow, costly and privacy-hostile.
4. Their tool access is either absent or all-or-nothing, with no policy model.
5. They cannot explain what they did, why, or whether it worked.

EDITH addresses all five with: task lifecycle management, structured memory with provenance, capability-aware model routing, a policy-governed tool layer, and an activity record for every task.

## 3. Target user

Primary: a single technically capable individual (developer / power user) on Linux with GNOME Wayland, who already uses MCP servers and agent skills through tools such as Claude Code, OpenCode or Antigravity.

Secondary (later): non-developer knowledge workers who want reminders, research digests and document work. These needs are deferred until the policy and memory models are proven.

Out of scope for v1: multi-user households, mobile clients, managed enterprise deployment.

## 4. Product principles

These are the non-negotiable constraints from the source specification, restated as design rules:

| # | Principle | Design consequence |
|---|-----------|--------------------|
| P1 | Modular | Ten-plus crates with explicit ownership ([PROJECT_STRUCTURE](EDITH_PROJECT_STRUCTURE.md)) |
| P2 | Rust-native runtime | Daemon, orchestration, tools, memory and policy are Rust; UI is the only TypeScript |
| P3 | Interchangeable models | `ModelProvider` trait; no agent code references a model name ([MODEL_ROUTING](EDITH_MODEL_ROUTING_DESIGN.md)) |
| P4 | Runtime independent of model | Task state machine and policy engine run with *no* model available |
| P5 | Memory independent of weights | Memory is a database, never a fine-tune ([MEMORY](EDITH_MEMORY_ARCHITECTURE.md)) |
| P6 | Skills discoverable and reusable | Skill registry with manifests and versions ([MCP_AND_SKILL](EDITH_MCP_AND_SKILL_ARCHITECTURE.md)) |
| P7 | MCP first-class | MCP registry is a core subsystem, not a plugin |
| P8 | Capability-aware routing | Router reads tool-calling support and context size per model |
| P9 | Simple tasks avoid models | Tier 0 deterministic path ([MODEL_ROUTING](EDITH_MODEL_ROUTING_DESIGN.md)) |
| P10 | Complex tasks get adequate reasoning | Escalation rules, never silent downgrade |
| P11 | Verifiable tasks | Each task declares verification criteria before execution ([ORCHESTRATION](EDITH_AGENT_ORCHESTRATION_DESIGN.md)) |
| P12 | Recoverable failures | Retry, fallback, checkpoint, and explicit `Failed` state |
| P13 | Non-blocking UI | All execution is async; UI subscribes to events |
| P14 | Operational visibility | Every operation has a trace ID, latency and error record |
| P15 | Security by design | Policy engine sits between every tool call and the OS ([SECURITY](EDITH_SECURITY_AND_AUTONOMY_POLICY.md)) |
| P16 | Honest prototype | Web prototype labels every simulated capability |
| P17 | Testable and maintainable | Each subsystem has a fake for tests ([TESTING](EDITH_TESTING_AND_EVALUATION_PLAN.md)) |
| P18 | Future-proof | Versioned contracts ([API_AND_EVENTS](EDITH_API_AND_EVENT_CONTRACTS.md)) |

## 5. Experience principles (how EDITH speaks and acts)

- **Act, then report.** Work first; communicate outcomes, blockers and decisions. No "Certainly, I would be delighted…" filler and no "Shall I proceed?" when the policy already allows the action.
- **Answer questions, accomplish objectives.** A question ends with an answer. An objective ends with verified evidence of completion, or a clear statement of what remains.
- **Never overstate.** Memory facts carry provenance. Unverified claims are labelled. A task is never "done" because a response was fluent.
- **Quiet by default.** Notifications appear only when they change what the user should do.
- **Visible work.** A short activity summary is always one click away. Raw model reasoning is not displayed by default.

## 6. Capability scope

| Capability area | v1 (MVP) | Later |
|-----------------|----------|-------|
| Text conversation | Yes | — |
| Deterministic utilities (time, calc, system status) | Yes | — |
| Local model inference (Qwen3 via Ollama / llama.cpp) | Yes | Fine-tuned EDITH checkpoint |
| Cloud escalation (opt-in) | Yes, per-task consent | Broader provider set |
| Task orchestration with subtasks | Sequential + bounded parallel | Full dependency graph scheduling |
| Persistent memory (4 types) | Episodic, semantic, working; procedural basic | Consolidation daemon, learned procedures |
| MCP host (stdio, Streamable HTTP) | Yes | Remote OAuth flows |
| Skill registry + adapters | Native + Claude Code + OpenCode | Antigravity adapter after config is verified |
| Code assistance on local repos | Yes, policy-gated | Background monitoring |
| Web search and source reading | Yes (API providers + direct fetch) | Browser automation |
| Voice input (push-to-talk first) | Yes | Continuous listening with wake word |
| Voice output | Yes | Barge-in refinements |
| Holographic overlay | Yes, with Wayland fallback | Animated core polish |
| Environment awareness (git, editor, focus) | Git + active project only | Editor/terminal integrations |
| Fine-tuning pipeline | Dataset export only | LoRA training and evaluation |

## 7. Specification analysis

The source specification was analysed before design. The items below are the ambiguities, conflicts and unrealistic assumptions. Each has a recorded resolution. None is silently ignored.

### 7.1 Conflicts resolved by design

| ID | Conflict | Resolution |
|----|----------|------------|
| C1 | "Do not implement real AI integrations" in the web prototype vs. "build working local UI interactions" | The prototype implements UI behaviour against typed mock services. Every mock is labelled `SIMULATED`. No network calls to model providers are made from the prototype. |
| C2 | "Local-first" vs. "Tier 3 cloud model" and "Gemini Live" | Cloud use is opt-in per provider and per data class. The router must record the data class of every cloud request. Audio and text sent to cloud providers are shown in the activity center. |
| C3 | Whisper (local) and Gemini Live (cloud) both listed for transcription | Default is local Whisper. Gemini Live is an alternative provider behind a consent switch. Both implement the same `SpeechRecognizer` trait. |
| C4 | "Run allowlisted development commands" vs. "Never allow arbitrary model-generated shell execution" | Commands are typed templates (for example `git status`, `cargo test`) with fixed argv arrays. No shell interpolation. Model output can fill declared parameters only, validated by schema. |
| C5 | "Minimise permission questions" vs. "Confirmation-required actions" | Confirmation is required only for four risk classes ([SECURITY](EDITH_SECURITY_AND_AUTONOMY_POLICY.md) §4). Confirmations are batched per task. Policies can be widened by the user. |
| C6 | "Do not expose raw reasoning" vs. "Explain what EDITH is doing" | The activity center shows structured steps, decisions and summaries. Model reasoning text is stored in traces for debugging, behind an explicit developer toggle. |
| C7 | "Do not collect everything on the computer" vs. "Continuously understand the environment" | Context sources are opt-in, event-driven, and time-bounded. Nothing is sampled continuously by default. |
| C8 | "Never present inferred information as fact" vs. memory "inferred from repeated behaviour" | Every memory item has a `provenance` enum (`explicit`, `inferred`, `temporary`, `assumption`, `outdated`). The `Who am I?` answer uses only `explicit` items unless the user accepts inferred ones. |
| C9 | Verify every task vs. research tasks with no mechanical oracle | Research tasks use *evidence verification*: every claim in the output must map to a retrieved source span, and unsupported claims are flagged. This is weaker than test verification and is labelled as such. |
| C10 | "Do not confuse multiple LLM calls with intelligence" | Parallelism is used only when a measured benefit is expected. Each parallel branch has a budget and a benchmark gate ([TESTING](EDITH_TESTING_AND_EVALUATION_PLAN.md) §6). |

### 7.2 Ambiguities requiring a decision

| ID | Ambiguity | Decision / status |
|----|-----------|-------------------|
| A1 | Which Qwen checkpoint? | Undecided by the owner. Candidates from the Qwen3 family: 4B, 8B, 14B, 30B-A3B (MoE), 32B. Decision gate: benchmark on the target machine (see [TECHNOLOGY_DECISIONS](EDITH_TECHNOLOGY_DECISIONS.md) D6). The architecture does not depend on the choice. |
| A2 | What is "Antigravity" at runtime? | Treated as two things: (a) a development environment used to build EDITH, and (b) a source of MCP and skill configuration on the user's PC. Its configuration format is **not verified** and the adapter is deferred. |
| A3 | Which Gemini model and transcription options? | The Live API documents a transcription-capable model and VAD controls. Model IDs change often; the adapter reads the model ID from configuration and the choice is verified at implementation time. |
| A4 | What counts as "research the best architecture" done? | Completion = a written recommendation, comparison table, cited sources, and a list of unverified assumptions. Quality is evaluated against a rubric ([TESTING](EDITH_TESTING_AND_EVALUATION_PLAN.md) §5). |
| A5 | Latency targets | The specification gives none. Proposed targets are in [PERFORMANCE_REQUIREMENTS](EDITH_PERFORMANCE_REQUIREMENTS.md) and are **hypotheses** to be benchmarked on the owner's hardware. |
| A6 | Who owns the hardware budget? | Unknown. The design assumes a 16 GB RAM / 8 GB VRAM class desktop as the minimum for a 8B-class local model. Larger models are optional. |
| A7 | Is EDITH multi-device? | No. Single machine for v1. |

### 7.3 Unrealistic or risky assumptions

| ID | Assumption | Reality | Mitigation |
|----|------------|---------|------------|
| U1 | Always-on-top transparent overlay works everywhere on Linux | Tauri/tao issue #1134 reports `always_on_top` not holding on Wayland; GNOME does not implement wlr-layer-shell (assumption, verify) | Overlay has three modes: layer surface (if available), XWayland window, or normal window. See [UI_UX](EDITH_UI_UX_SPECIFICATION.md) §3.6 and [RISK_REGISTER](EDITH_RISK_REGISTER.md) R6. |
| U2 | Local models can match cloud reasoning | Local 8B–32B models are materially weaker on long multi-step planning | Tier escalation, plan verification, and an honest quality indicator per route |
| U3 | MCP servers and skills are portable between Claude Code, OpenCode and Antigravity | Their configuration formats differ; OpenCode uses an `mcp` object in `opencode.json`; Claude Code skills are `SKILL.md` folders | Adapter layer with a canonical internal model ([MCP_AND_SKILL](EDITH_MCP_AND_SKILL_ARCHITECTURE.md) §6) |
| U4 | Skills are executable | A skill is usually instructions plus optional scripts. Claude Code documentation states that skill rules are "a request, not a guarantee" | Internal type split: `Instruction`, `Tool`, `McpTool`, `ExternalService` |
| U5 | Continuous, always-on listening is cheap | Continuous ASR and VAD consume CPU and power | Push-to-talk first; wake-word later; measured budget |
| U6 | Persistent memory improves quality automatically | Without curation, memory accumulates errors and contradictions | Provenance, contradiction detection, user review queue, forgetting policy |
| U7 | Fine-tuning will improve EDITH | Training on unreviewed interactions degrades quality | Dataset requires human approval; evaluation gate before any model is promoted |
| U8 | Browser automation as a general search tool | Brittle, slow and a large security surface | Deferred to Phase 12; API search first |

## 8. Research basis

Research was performed on 2026-11-03. Claims are summarised in [RESEARCH_AND_COMPETITOR_ANALYSIS](EDITH_RESEARCH_AND_COMPETITOR_ANALYSIS.md) with sources. Claims are classified as **Verified** (checked against a primary or near-primary source in this research pass), **Recommendation** (architectural judgement), **Assumption** (not checked), or **Experimental** (needs a spike).

## 9. Definition of the product

EDITH v1 is complete when the owner can, on their own Linux desktop and without a browser:

1. Ask a question and get a routed, correct answer, with the route visible.
2. Give an objective ("research X and write a recommendation") and see it executed with a plan, sources, and a verified output.
3. Ask "what was I working on?" and receive an answer that separates confirmed facts from inferences.
4. Use the MCP servers and skills already configured for Claude Code or OpenCode, with per-tool permissions.
5. Speak to EDITH, interrupt it, and have the interaction continue correctly.
6. Inspect, correct and delete any memory item.
7. Review every action in the audit log, and cancel any running task.

Detailed acceptance criteria per phase are in [IMPLEMENTATION_ROADMAP](EDITH_IMPLEMENTATION_ROADMAP.md).

## 10. Glossary

| Term | Meaning |
|------|---------|
| Task | A user objective with a lifecycle and state machine ([ORCHESTRATION](EDITH_AGENT_ORCHESTRATION_DESIGN.md)) |
| Subtask | A unit of work inside a task, with dependencies |
| Tier 0–4 | Execution tiers from deterministic code to specialist services ([MODEL_ROUTING](EDITH_MODEL_ROUTING_DESIGN.md)) |
| Route | A decision record: tier, provider, model, reason, fallback chain |
| Capability | Anything EDITH can invoke or consult: instruction, native tool, MCP tool, or external service |
| Provenance | Origin label on a memory item |
| Policy | Rule set mapping (capability, arguments, scope) to an autonomy class |
| Autonomy class | `Automatic`, `PolicyControlled`, `ConfirmRequired`, `Blocked` |
| Activity | A user-facing summary of task steps, tool calls and verification |
| Trace | Developer-facing record of every operation with timing and errors |
| Simulated | Any prototype capability backed by mock data; always labelled |
