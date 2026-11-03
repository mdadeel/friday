# EDITH — Performance Requirements

Companion: [TESTING](EDITH_TESTING_AND_EVALUATION_PLAN.md) §6 · [MODEL_ROUTING](EDITH_MODEL_ROUTING_DESIGN.md) §8 · [VOICE](EDITH_VOICE_ARCHITECTURE.md) §5

**Important:** every target below is a **hypothesis to be benchmarked** on the owner's hardware, as the specification requires. The reference machine is a Linux desktop with a mid-range GPU (assumed 8 GB VRAM, 16 GB RAM — assumption A6). Targets are stated as p50 (median) and p95 unless noted. A target becomes a requirement only after a baseline measurement, and then it is fixed in the release gate.

## 1. Measurement rules

- Warm and cold runs are reported separately.
- Models loaded for the measured run are recorded (name, quantisation, context size).
- Measurements use the trace system ([OBSERVABILITY](EDITH_DETAILED_SYSTEM_DESIGN.md) §3.23), not wall-clock estimates from the UI.
- Benchmarks run on an idle machine with power profile "performance" and results include the machine state.

## 2. Application and startup

| Metric | Target (hypothesis) | Notes |
|--------|---------------------|-------|
| Daemon ready (health OK) from process start, cold | ≤ 2.0 s | Lazy loading of models, MCP, voice |
| Daemon ready, warm (second start) | ≤ 1.0 s | |
| Desktop UI first interactive frame | ≤ 1.5 s after window creation | |
| Overlay visible after login | ≤ 3.0 s | Autostart |
| Model load (Tier 2, cold) | ≤ 10 s | Shown as progress; not blocking UI |
| Model load (Tier 3, cold) | ≤ 30 s | Shown with warning |
| MCP server first connection (stdio) | ≤ 2.0 s | Lazy start |

## 3. Responsiveness and inference

### 3.1 Conversation

| Metric | Target | Notes |
|--------|--------|-------|
| Time to first visible response (Tier 0) | ≤ 100 ms | No model |
| Time to first visible response (Tier 1 classification + route) | ≤ 200 ms | Classification before any LLM |
| Time to first token (Tier 2, warm) | ≤ 800 ms | Gate G1 result may revise |
| Time to first token (Tier 3, warm) | ≤ 2.5 s | |
| Streaming smoothness | No gaps > 500 ms during stream | Stream idle timeout is 20 s |
| Cancellation to stop | ≤ 200 ms | |

### 3.2 Model and provider overhead

| Metric | Target |
|--------|--------|
| Provider request overhead (EDITH side, excluding model time) | ≤ 5 ms p95 |
| Connection reuse rate for local providers | ≥ 95% |
| Router decision time | ≤ 2 ms p95 (rules); ≤ 150 ms p95 (with Tier 1 classifier) |

### 3.3 Tools

| Metric | Target |
|--------|--------|
| Native tool dispatch overhead (policy + invoke + audit) | ≤ 5 ms p95 |
| Command template process start to first output | ≤ 50 ms p95 (excluding command runtime) |
| MCP stdio call overhead (EDITH side) | ≤ 10 ms p95 |
| Policy evaluation | ≤ 1 ms p99 |

### 3.4 Voice

| Metric | Target |
|--------|--------|
| Speech onset to first partial | ≤ 400 ms p95 |
| End of speech to final transcript (local ASR) | ≤ 700 ms p95 |
| End of speech to final transcript (cloud ASR, manual VAD) | ≤ 500 ms p95 |
| Barge-in: speech onset to TTS silence | ≤ 150 ms p95 |
| Text-to-speech first audio after first sentence | ≤ 600 ms p95 |
| Capture callback jitter | No overruns in 1-hour soak |

### 3.5 Search and research

| Metric | Target |
|--------|--------|
| First result set | ≤ 1.5 s p50; ≤ 4 s p95 |
| Source fetch (per document) | ≤ 3 s p50; timeout 20 s |
| Evidence extraction per document (Tier 2) | ≤ 5 s p50 |
| Full research task (10 sources) | ≤ 5 min p50 |

### 3.6 Memory

| Metric | Target |
|--------|--------|
| Memory retrieval (keyword + vector) at 100k items | ≤ 50 ms p95 |
| Memory write (gate + store) | ≤ 20 ms p95 |
| Context construction (assembly before model call) | ≤ 30 ms p95 |
| Consolidation job | Runs only when idle; must not delay interactive requests (checked by test) |

### 3.7 Task completion

| Metric | Target |
|--------|--------|
| Simple task (Tier 2, no tools) end to end | ≤ 5 s p50 |
| Tool task (3 tool calls, one model step) | ≤ 20 s p50 |
| Research task (see 3.5) | ≤ 5 min p50 |
| Coding task on a 5k-line repository (fix and tests) | ≤ 10 min p50, budget 15 min |

### 3.8 Resilience

| Metric | Target |
|--------|--------|
| Recovery from provider failure to fallback response | ≤ 5 s p95 (failure detected and fallback started) |
| MCP server restart after crash | ≤ 3 s p95 |
| Audio device reopen after unplug | ≤ 5 s p95 |
| Daemon restart with task resume | ≤ 3 s to resume state |

## 4. Resource budgets

| Resource | Idle budget | Active budget |
|----------|-------------|---------------|
| Daemon RSS (excluding models) | ≤ 150 MB | ≤ 300 MB |
| Overlay webview RSS | ≤ 150 MB | ≤ 200 MB |
| Daemon CPU, idle | ≤ 1% | — |
| Overlay CPU, idle | ≤ 3% | ≤ 8% while animating |
| Voice capture CPU | — | ≤ 10% during listening (local ASR) |
| Disk growth per month, heavy use | ≤ 1 GB | — |

## 5. Concurrency, backpressure and cancellation

- Event fan-out: per-client queue 1,024 events; lag signalled, never silent drop.
- Token stream: bounded channel of 64 chunks; producer waits on full queue (backpressure to provider).
- Worker slots: default 4; interactive tasks preempt background work.
- Per-provider concurrency: local default 1 active generation; cloud default 4.
- Cancellation: every async operation accepts a cancel token; the orchestrator's cancellation tree reaches all children.
- Graceful degradation order when resources are short: stop background jobs → unload Tier 3 → reduce context → use smaller tier → report.

## 6. Caching

| Cache | Key | TTL | Size cap |
|-------|-----|-----|----------|
| Search results | provider + normalised query | 24 h | 200 MB |
| Documents and spans | URL + content hash | 7 d | 2 GB |
| Embeddings | text hash + model id | until model changes | 1 GB |
| MCP catalogue | server id + version | until list-changed | 10 MB |
| Route health | provider | 30 s | in memory |

## 7. Observability requirements

- Every operation emits a span with start, end, status and error code.
- Histograms exported to the diagnostics view: model first token, tool duration, ASR latency, search latency, memory retrieval.
- Slow-operation log: any operation exceeding its target by 2× produces a warning event.

## 8. Measuring the targets

| Benchmark | Frequency | Output |
|-----------|-----------|--------|
| Startup suite | Every release candidate | Startup table |
| Inference suite (G1 workload) | Each model change | Latency and quality table |
| Voice timing harness | Each audio change | Timing histogram |
| Research suite | Each search change | Latency and citation metrics |
| Soak test (24 h) | Before release | Memory, CPU and leak report |

## 9. Hardware assumptions

- Minimum: 8-core CPU, 16 GB RAM, 8 GB VRAM for an 8B-class model at 4-bit quantisation.
- Recommended: 16 GB VRAM for larger checkpoints or higher context.
- Storage: NVMe recommended; model loads on HDD exceed startup targets (documented as a limitation).
