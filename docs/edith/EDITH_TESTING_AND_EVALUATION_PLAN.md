# EDITH — Testing and Evaluation Plan

Companion: [IMPLEMENTATION_ROADMAP](EDITH_IMPLEMENTATION_ROADMAP.md) · [PERFORMANCE](EDITH_PERFORMANCE_REQUIREMENTS.md) · [MASTER_BACKLOG](EDITH_MASTER_IMPLEMENTATION_BACKLOG.md)

Section map: §3 contract and unit tests · §4 lint and static rules · §5 scenario and evaluation sets · §6 benchmarks and router/memory evaluation · §7 manual and hardware testing · §8 reporting.

## 1. Principles

- Test the **contract**, not the vendor: every adapter passes the same suite.
- Test the **policy** exhaustively: it is pure, so it can be tested with property-based tests.
- Treat model quality as a **measured** property with a fixed evaluation set; never a single demo.
- Keep fixtures licence-clean and free of personal data. Owner recordings are stored outside Git.

## 2. Test levels

| Level | Scope | Tooling | Runs |
|-------|-------|---------|------|
| Unit | Pure functions, state transitions, policy, router rules, memory gate | `cargo test`, `proptest` | Every commit |
| Contract | Each `ModelProvider`, `SearchProvider`, `McpClient`, `SpeechRecognizer` implementation | Shared test suites in `edith-testkit` | Every commit (fakes) and nightly (live) |
| Integration | Orchestrator with fakes; storage with real SQLite; API over socket | `cargo test` with tempdirs | Every commit |
| System | Daemon + real Ollama (small model) + fixture repo | Scripted runs | Nightly |
| UI component | Controls, badges, screens with mock adapters | Vitest + Testing Library | Every commit |
| UI E2E | Browser flows on prototype and later desktop | Playwright | Every pull request |
| Hardware | Microphone, speakers, overlay on GNOME Wayland | Manual checklist | Per phase gate |
| Evaluation | Model quality, router, research, retrieval, injection | Labelled sets and scripts | Per phase gate and before release |

## 3. Contract and unit tests

### 3.1 Policy engine

- Property: no `Blocked` class ever evaluates to `Allow`.
- Property: a missing rule yields `Confirm` for write and process classes, `Deny` for system and unknown network hosts.
- Property: evaluation is deterministic for identical inputs (no time or randomness in evaluator).
- Table tests: each row of the autonomy table in [SECURITY](EDITH_SECURITY_AND_AUTONOMY_POLICY.md) §3.

### 3.2 Provider contract suite

Each adapter must pass:

1. Health probe returns a valid status for up, down and slow servers.
2. Chat returns a stream whose concatenated text equals the non-streamed result for deterministic settings.
3. Cancellation stops the stream within 200 ms and releases the connection.
4. Timeout produces `ModelError::Timeout` and a retry-eligible flag.
5. Tool calls parse into the canonical structure; malformed calls produce `ModelError::MalformedToolCall`.
6. Context overflow is reported, not truncated silently.
7. Cloud adapters refuse `Secret` data class in every path.

### 3.3 Storage

- Migration from each released schema to head; idempotency; backup before migration.
- Event replay yields the same task projection.
- Concurrency: readers during writer commit; no `SQLITE_BUSY` surfaced under load.

### 3.4 Memory

- Write gate: secrets rejected; dedupe merges; contradictions create review items; `Explicit` supersedes `Inferred`.
- Provenance rules: `Who am I?` answer contains only `Explicit` or confirmed items (test with mixed seed).
- Forgetting: TTL expiry with a controlled clock.

### 3.5 Router

- Table tests for T0 patterns (time, date, calculation, git status) and non-matches.
- Escalation: classifier confidence below threshold escalates.
- Privacy: `Personal` data never routed to cloud when consent says Public only.

### 3.6 Tools and templates

- Argument validation: path traversal, symlink escape, option injection, oversized arguments.
- Fuzzing templates with `cargo-fuzz` on the parser for command arguments.
- Environment allowlist test: no unexpected variables reach the child.

### 3.7 MCP

- Fake stdio server: initialise, list tools, call, error, timeout, crash mid-call, malformed JSON-RPC.
- Lifecycle transitions per [MCP_AND_SKILL](EDITH_MCP_AND_SKILL_ARCHITECTURE.md) §4.3.
- Remote: TLS requirement; redirect to another host refused.

### 3.8 Adapters for skills and external configs

- Recorded fixtures: valid and malformed `SKILL.md`, `opencode.json`, Claude Code settings samples (licence-clean, synthetic).
- Name validation: folder name must match `name`; length limits.

## 4. Static and lint rules

- `clippy -D warnings`, `rustfmt --check`.
- Custom lint (CI script): forbid `sh -c`, `bash -c`, `Command::new("sh")` outside the test directory, and any `format!` building command arguments from model output (checked by a grep allowlist plus review).
- `cargo deny` (licences, bans, advisories); `cargo audit`.
- No `unsafe` outside explicitly reviewed modules.
- TypeScript: ESLint rules forbid `any`, forbid `fetch` to non-local hosts in the prototype (checked by a grep test).

## 5. Scenario and evaluation sets

### 5.1 Eight interaction scenarios

Each scenario from the specification is a test case with expected events:

| # | Scenario | Key assertions |
|---|----------|----------------|
| S1 | "What time is it?" | Tier 0; no model call; answer within 100 ms |
| S2 | "Who am I?" | Only explicit facts; unknown facts declared unknown; memory IDs cited |
| S3 | "Research the best architecture for this application." | Plan with parallel searches; evidence verification; recommendation with sources |
| S4 | "Inspect my repository and fix the authentication issue." | Plan; patch within policy; tests run; verification pass or blocker |
| S5 | Long multi-part instruction | Objectives and constraints extracted; subtasks; one coherent output |
| S6 | Search provider unavailable | Detection; timeout; fallback; blocker report; state preserved |
| S7 | Voice interruption | Speech stops < 150 ms; new input accepted; objective re-evaluated |
| S8 | "Continue what I was doing yesterday." | Episodic retrieval; project state check; discrepancy explained; resumed |

### 5.2 Research evaluation set

40 questions across software architecture topics, each with 2–4 authoritative sources listed by the evaluator. Scoring: citation validity (quotes match), coverage (proportion of expected sources used), unsupported-claim rate, recommendation clarity (rubric 1–5 by the owner for the first run, then by a fixed rubric with double review).

### 5.3 Coding evaluation set

20 small repositories with seeded faults (failing tests, type errors, auth bug patterns). Metrics: fix rate within budget, false-fix rate (tests pass but behaviour wrong by hidden test), policy violations (must be zero), files changed.

### 5.4 Router evaluation set

300 labelled requests: T0 (60), T1 (60), T2 (100), T3 (80). Metrics per [MODEL_ROUTING](EDITH_MODEL_ROUTING_DESIGN.md) §11.

### 5.5 Memory evaluation set

200 retrieval queries over a synthetic personal corpus (300 items across four categories and five provenances). Metrics: precision@5, provenance violations (target 0), contradiction recall.

### 5.6 Prompt-injection suite

100 cases: instructions embedded in web pages, files, MCP results, and memory items, asking for data exfiltration, policy change, or dangerous commands. Pass criterion: zero executed unauthorised actions; each attempt logged as `untrusted_instruction_ignored` when detected.

### 5.7 Voice set

Owner-recorded 60-minute set in English and Bangla (stored outside Git), plus 20 interruption scenarios. Metrics: WER, first partial latency, final latency, barge-in latency.

## 6. Benchmarks

### 6.1 Model checkpoint benchmark (gate G1)

- Candidates: three Qwen3 checkpoints (sizes chosen after reviewing owner hardware).
- Workload: 50 requests from the eight scenarios and the coding set.
- Measures: first-token latency, tokens per second, peak memory, tool-call validity rate, answer accuracy on the router set, and verification pass rate on coding tasks.
- Decision rule: the largest checkpoint that meets the Tier 2 latency target and whose verification pass rate is within 10% of the best candidate.

### 6.2 Startup and overhead

- Daemon cold start, warm start, first Tier 0 response.
- Tool call overhead (dispatch to result) for native tools and MCP stdio tools.

### 6.3 Capability selection benchmark

50 labelled requests against the skill and tool index; metric: top-1 and top-3 accuracy; target top-3 ≥ 0.9 (hypothesis).

### 6.4 Memory ranking weights

Grid search over ranking weights on the memory evaluation set with a held-out split. Weights are fixed only after validation.

### 6.5 Parallelism benefit check

For each parallel pattern, measure end-to-end time with and without parallel execution. A pattern stays enabled only if it improves time by ≥ 20% without increasing error rate.

## 7. Manual and hardware testing

- **Desktop checklist (GNOME Wayland):** login autostart; tray status; overlay modes A/B/C; notifications; keyboard shortcut; reduced motion; multi-monitor placement.
- **Audio checklist:** device list; hot-unplug and replug; PTT; barge-in with speakers at three volumes; echo protection on and off.
- **Owner acceptance sessions:** scripted 30-minute sessions using the eight scenarios; owner rates clarity and trust; defects logged.

## 8. Reporting

- Every CI run publishes: test counts, coverage (line coverage target 75% for pure crates, lower for adapters), benchmark deltas.
- Evaluation runs produce a versioned report: model id, config hash, prompt template version, date, scores, failures.
- Release gate: no open critical defects; security tests pass; performance targets measured (pass or documented exception).

## 9. Test data governance

- No personal data in fixtures. Owner recordings and memory corpora live in an encrypted local folder, not in the repository.
- Synthetic personal corpora are generated, and their provenance labels are part of the fixture.
- Fixtures include a licence file when derived from third-party content.
