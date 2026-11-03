# Sources and verification status

Checked by the prototype author on **2026-11-03** (Asia/Dhaka). Each row says what was confirmed on the page and what was not. Anything not listed here is unverified and must be treated as an assumption, a recommendation, or a future feature.

The fixed reference list in `src/data/searchBank.ts` is built only from the rows marked **Verified**. The prototype does not fetch these pages at runtime.

| # | Source | Checked | Verified on the page | Not verified |
|---|--------|---------|----------------------|--------------|
| 1 | https://ollama.com/library/qwen3 | 2026-11-03 | Tags 0.6b, 1.7b, 4b, 8b, 14b, 30b, 32b, 235b. Disk sizes: 523 MB, 1.4 GB, 2.5 GB, 5.2 GB, 9.3 GB, 19 GB, 20 GB, 142 GB. Context: 40K for 0.6b/1.7b/8b/14b/32b; 256K for 4b/30b/235b. Family tags: `tools`, `thinking`. Example API port 11434. | Whether these sizes match your machine's downloads; benchmark quality; what the `tools` tag guarantees in EDITH. |
| 2 | https://github.com/modelcontextprotocol/rust-sdk | 2026-11-03 | Repository describes itself as the official Rust SDK for MCP. Latest commit dated Nov 3, 2026. | Crate name `rmcp`, versions and API. Not confirmed on this page. |
| 3 | https://code.claude.com/docs/en/agent-sdk/skills | 2026-11-03 | Skills are `SKILL.md` files in `.claude/skills/<name>/SKILL.md`; loaded from filesystem settings; model-invoked or invoked with `/name`; controlled by the `skills` option. | This is Claude Code/Agent SDK documentation, not EDITH's skill format and not MCP. |
| 4 | https://aistudio.google.com/docs/live-api (redirect from ai.google.dev) | 2026-11-03 | Stateful WebSocket API; input 16-bit PCM at 16 kHz; output 24 kHz; audio transcriptions; tool use; 70 languages. | Gemini Live model ID (kept as TBD in the docs); pricing; availability in Bangladesh. |
| 5 | https://github.com/tauri-apps/tao/issues/1134 | 2026-11-03 | `with_always_on_top` reported not working under Wayland; labelled `status: upstream`; a maintainer asked whether Wayland supports it; history includes "closed as not planned" and "reopened" (Aug 2025). | Current behaviour in any released version; behaviour on any specific compositor. |
| 6 | https://github.com/ggml-org/whisper.cpp | 2026-11-03 | Repository describes itself as a C/C++ port of Whisper. | Streaming, server examples, and licence. Both are unverified. |
| 7 | https://spec.modelcontextprotocol.io/ | 2026-11-03 (attempted) | Nothing. The fetch returned HTTP 500. | All MCP specification claims, including any transport deprecation. Re-check before citing. |

## Items that are assumptions, not sourced facts

These appear in the blueprint as assumptions or hypotheses. The prototype labels them as such.

- Letta licence; Silero VAD; Piper TTS; PipeWire vs cpal; SearXNG; tantivy; whisper.cpp MIT licence; Open Interpreter; OpenHands; GNOME lacking wlr-layer-shell.
- Overlay mode targets for always-on-top (mode A strong, mode B window-manager dependent, mode C best effort): design targets, not verified on any platform.
- Tier thresholds (for example the Tier 1 confidence 0.75) and the 700 ms endpoint silence: hypotheses to be measured.
- Model tier assignments: candidates until gate G1 (benchmark) closes.

## Not used

- Rig and Letta star counts and version figures from third-party wikis: sources disagree, so they are not cited.
- Gemini model name strings: sources conflict; the docs keep the ID as TBD.
- Antigravity MCP configuration: no documentation was found; the adapter stays deferred.
