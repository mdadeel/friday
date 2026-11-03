# ADR-0002: Dual Transport Daemon: Unix Domain Socket and Loopback TCP

## Context
The architecture specification defines `$XDG_RUNTIME_DIR/edith/api.sock` as the local API transport. However, web browsers (running the Vite development prototype or external web testing) cannot make HTTP requests or open WebSockets over Unix domain sockets. Only native desktop runtimes (like Tauri via custom plugins) can directly speak to Unix sockets.

## Decision
The daemon (`edith-daemon`) will support a dual transport configuration:
1. Unix Domain Socket at `$XDG_RUNTIME_DIR/edith/api.sock` (mode `0600`) for production desktop IPC and local CLI tools.
2. Loopback TCP listener at `127.0.0.1:<port>` (default 4242) for web development and browser-based testing.
3. Both transports require the same bearer token authentication (per-launch token written to `$XDG_RUNTIME_DIR/edith/token` mode `0600`).
4. Loopback TCP enforces strict CORS headers allowing requests from authorized local origins (e.g. `http://localhost:5173`).

## Status
Accepted.

## Consequences
- The web prototype can immediately connect to the real daemon during development without needing special OS-level socket forwarding.
- Security remains tight since TCP binds strictly to `127.0.0.1` and requires bearer token authorization.
