# EDITH 2.0 — Known Issues & Technical Constraints

## Current Constraints & Known Issues

1. **Wayland Global Shortcuts and Transparent Overlay:**
   - On GNOME Wayland (`Ubuntu 26.04.1`), global keyboard shortcuts require the XDG Desktop Portal (`org.freedesktop.portal.GlobalShortcuts`).
   - Transparent click-through overlay is not supported natively by GNOME Mutter without XWayland or custom GNOME extensions.
   - *Mitigation:* Prioritize responsive floating window mode; retain overlay as an optional feature.

2. **Unified Memory on AMD APU:**
   - Total system memory is 16 GB with ~9.5 GB available.
   - Large LLM checkpoints (>7B parameters) will cause system thrashing if Faster-Whisper is also loaded.
   - *Mitigation:* Default to Qwen3-0.6B for Tier 1 and Qwen3-4B for Tier 2/3. Use strict process memory bounds.

3. **Unix Socket Browser Incompatibility:**
   - Standard browsers running the web prototype cannot open Unix domain sockets.
   - *Mitigation:* Loopback TCP listener enabled in dev mode with bearer token auth.
