# EDITH

A local-first AI assistant platform written in Rust.

EDITH (this repository is named `friday`) is a workspace of 15 crates implementing an agent runtime and the systems around it: an event bus, SQLite storage, tool execution, MCP integration, memory, voice, search, an HTTP API (`axum`), and a desktop shell — shipped as a background daemon and a CLI.

> **Status:** early development. Interfaces and behavior change frequently.

## Workspace layout

| Crate | Area |
|---|---|
| `crates/edith-core` | Core types and traits |
| `crates/edith-events` | Event bus |
| `crates/edith-storage` | SQLite-backed persistence |
| `crates/edith-models` | Data models |
| `crates/edith-agent` | Agent runtime |
| `crates/edith-router` | Routing |
| `crates/edith-tools` | Tool execution |
| `crates/edith-mcp` | Model Context Protocol integration |
| `crates/edith-memory` | Memory subsystem |
| `crates/edith-voice` | Voice I/O |
| `crates/edith-search` | Search integration |
| `crates/edith-desktop` | Desktop shell |
| `crates/edith-api` | HTTP API (axum) |
| `apps/daemon` | Long-running daemon |
| `apps/cli` | Command-line client |

## Build

Requires a stable Rust toolchain (edition 2021).

```bash
cargo build --release
```

## Run

```bash
# Daemon
cargo run --release -p daemon

# CLI
cargo run --release -p cli
```

## Development

```bash
cargo test --workspace
cargo fmt
cargo clippy --workspace
```

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
