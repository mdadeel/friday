import type { SearchResult } from '../../types/contracts';
import type { SearchService } from '../contracts';

/** A fixed bank of reference links from the design research. Results are NOT a live search. */
const BANK: { keywords: string[]; title: string; url: string; snippet: string }[] = [
  { keywords: ['mcp', 'rust', 'sdk'], title: 'Official Rust SDK for the Model Context Protocol', url: 'https://github.com/modelcontextprotocol/rust-sdk', snippet: 'Crate rmcp; the design candidate for the MCP host (see TECHNOLOGY_DECISIONS D3).' },
  { keywords: ['mcp', 'transport', 'spec', 'http'], title: 'MCP specification — transports', url: 'https://spec.modelcontextprotocol.io/', snippet: 'stdio and Streamable HTTP are the standard transports; HTTP+SSE is deprecated.' },
  { keywords: ['skill', 'skills', 'agent'], title: 'Agent Skills — Claude Code SDK documentation', url: 'https://code.claude.com/docs/en/agent-sdk/skills', snippet: 'SKILL.md layout and frontmatter. Skills are instructions, not enforcement.' },
  { keywords: ['whisper', 'speech', 'asr', 'stt', 'voice'], title: 'whisper.cpp', url: 'https://github.com/ggml-org/whisper.cpp', snippet: 'Local speech-to-text, including a streaming example and an HTTP server example.' },
  { keywords: ['live', 'gemini', 'transcription', 'audio'], title: 'Gemini Live API — transcription', url: 'https://ai.google.dev/gemini-api/docs/live-api', snippet: 'Input transcription and manual activity signalling. Model IDs change; verify before use.' },
  { keywords: ['overlay', 'wayland', 'window', 'tauri'], title: 'tao issue: always_on_top on Wayland', url: 'https://github.com/tauri-apps/tao/issues/1134', snippet: 'Always-on-top is unreliable on Wayland; the overlay design needs fallbacks.' },
  { keywords: ['local', 'ollama', 'llm', 'model', 'qwen'], title: 'Qwen3 model collection', url: 'https://huggingface.co/collections/Qwen/qwen3', snippet: 'Sizes and licences per checkpoint. Checkpoint choice is open gate G1.' },
];

export function createSearchService(): SearchService {
  const query: SearchService['query'] = (text) =>
    new Promise<SearchResult[]>((resolve) => {
      const q = text.toLowerCase();
      const words = q.split(/\W+/).filter(Boolean);
      const hits = BANK.map((b) => ({ b, score: b.keywords.filter((k) => words.some((w) => w.includes(k) || k.includes(w))).length }))
        .filter((x) => x.score > 0)
        .sort((a, c) => c.score - a.score)
        .slice(0, 5)
        .map((x): SearchResult => ({
          title: x.b.title,
          url: x.b.url,
          provider: 'simulated reference bank',
          authorityTier: 2,
          snippet: x.b.snippet,
          simulated: true,
        }));
      setTimeout(() => resolve(q.trim() ? hits : []), 700);
    });
  return { query };
}
