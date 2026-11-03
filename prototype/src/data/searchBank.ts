// Fixed reference list drawn from the design research. It is NOT a live search index.
// Entries are used by the simulated search service and as evidence in simulated research tasks.
import type { EvidenceSource, SearchResult } from '../types/contracts';

export interface BankEntry {
  keywords: string[];
  title: string;
  url: string;
  snippet: string;
  authorityTier: 1 | 2 | 3;
  date: string;
}

export const SEARCH_BANK: BankEntry[] = [
  { keywords: ['mcp', 'rust', 'sdk'], title: 'Official Rust SDK for the Model Context Protocol', url: 'https://github.com/modelcontextprotocol/rust-sdk', snippet: 'Crate rmcp; the design candidate for the MCP host (TECHNOLOGY_DECISIONS D3).', authorityTier: 1, date: '2026-07' },
  { keywords: ['mcp', 'transport', 'spec', 'http'], title: 'MCP specification — transports', url: 'https://spec.modelcontextprotocol.io/', snippet: 'stdio and Streamable HTTP are the standard transports; HTTP+SSE is deprecated.', authorityTier: 1, date: '2025-03' },
  { keywords: ['skill', 'skills', 'agent'], title: 'Agent Skills — Claude Code SDK documentation', url: 'https://code.claude.com/docs/en/agent-sdk/skills', snippet: 'SKILL.md layout and frontmatter. Skills are instructions, not enforcement.', authorityTier: 1, date: '2026-05' },
  { keywords: ['whisper', 'speech', 'asr', 'stt', 'voice'], title: 'whisper.cpp', url: 'https://github.com/ggml-org/whisper.cpp', snippet: 'Local speech-to-text, including a streaming example and an HTTP server example.', authorityTier: 2, date: '2026-06' },
  { keywords: ['live', 'gemini', 'transcription', 'audio'], title: 'Gemini Live API — transcription', url: 'https://ai.google.dev/gemini-api/docs/live-api', snippet: 'Input transcription and manual activity signalling. Model IDs change; verify before use.', authorityTier: 1, date: '2026-04' },
  { keywords: ['overlay', 'wayland', 'window', 'tauri'], title: 'tao issue: always_on_top on Wayland', url: 'https://github.com/tauri-apps/tao/issues/1134', snippet: 'Always-on-top is unreliable on Wayland; the overlay design needs fallbacks.', authorityTier: 3, date: '2025-09' },
  { keywords: ['local', 'ollama', 'llm', 'model', 'qwen', 'architecture'], title: 'Qwen3 model collection', url: 'https://huggingface.co/collections/Qwen/qwen3', snippet: 'Sizes and licences per checkpoint. Checkpoint choice is open gate G1.', authorityTier: 2, date: '2026-05' },
];

export function searchBank(query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean);
  return SEARCH_BANK.map((b) => ({ b, score: b.keywords.filter((k) => words.some((w) => w.includes(k) || k.includes(w))).length }))
    .filter((x) => x.score > 0)
    .sort((a, c) => c.score - a.score)
    .slice(0, 5)
    .map(({ b }) => ({ title: b.title, url: b.url, provider: 'simulated reference bank', authorityTier: b.authorityTier, snippet: b.snippet, simulated: true as const }));
}

/** Evidence cards for a simulated research task: the top sources for the objective. */
export function evidenceFor(objective: string): EvidenceSource[] {
  const hits = searchBank(objective).slice(0, 3);
  return hits.map((h, i) => {
    const entry = SEARCH_BANK.find((b) => b.url === h.url)!;
    return { id: `ev-${i + 1}`, title: h.title, url: h.url, authorityTier: entry.authorityTier, date: entry.date, spans: 2 + i, simulated: true as const };
  });
}
