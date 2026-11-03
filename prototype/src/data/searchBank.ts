// Fixed reference list. Each entry was opened by hand and the claim written from what the page said on 2026-11-03.
// The prototype does NOT search the web or fetch these pages. Entries that could not be checked are left out.
import type { EvidenceSource, SearchResult } from '../types/contracts';

export interface BankEntry {
  keywords: string[];
  title: string;
  url: string;
  claim: string;
  authorityTier: 1 | 2 | 3;
  checkedOn: string;
}

const CHECKED = '2026-11-03';

export const SEARCH_BANK: BankEntry[] = [
  {
    keywords: ['mcp', 'rust', 'sdk'],
    title: 'modelcontextprotocol/rust-sdk (GitHub repository)',
    url: 'https://github.com/modelcontextprotocol/rust-sdk',
    claim: 'Repository described as the official Rust SDK for the Model Context Protocol. Crate names were not checked on this page.',
    authorityTier: 1,
    checkedOn: CHECKED,
  },
  {
    keywords: ['skill', 'skills', 'agent'],
    title: 'Extend agents with skills (Claude Code docs)',
    url: 'https://code.claude.com/docs/en/agent-sdk/skills',
    claim: 'Skills are SKILL.md files in a skill directory. The SDK discovers them from filesystem settings, and Claude decides when to invoke them.',
    authorityTier: 1,
    checkedOn: CHECKED,
  },
  {
    keywords: ['live', 'gemini', 'transcription', 'audio', 'voice'],
    title: 'Gemini Live API overview (Google AI Studio)',
    url: 'https://aistudio.google.com/docs/live-api',
    claim: 'Stateful WebSocket API. Audio input is 16-bit PCM at 16 kHz, output 24 kHz. Audio transcriptions, tool use and 70 languages are listed. The model ID is not on this page.',
    authorityTier: 1,
    checkedOn: CHECKED,
  },
  {
    keywords: ['whisper', 'speech', 'asr', 'stt', 'voice'],
    title: 'ggml-org/whisper.cpp (GitHub repository)',
    url: 'https://github.com/ggml-org/whisper.cpp',
    claim: 'Repository describes itself as a C/C++ port of Whisper. Streaming, server examples and licence were not checked on this page.',
    authorityTier: 2,
    checkedOn: CHECKED,
  },
  {
    keywords: ['overlay', 'wayland', 'window', 'tauri', 'always', 'top'],
    title: 'tauri-apps/tao issue #1134: always-on-top on Wayland',
    url: 'https://github.com/tauri-apps/tao/issues/1134',
    claim: 'Reports that with_always_on_top does not work under Wayland. Labelled upstream; a maintainer asked whether Wayland supports it; the issue was closed as not planned and reopened (Aug 2025).',
    authorityTier: 3,
    checkedOn: CHECKED,
  },
  {
    keywords: ['local', 'ollama', 'llm', 'model', 'qwen', 'qwen3', 'architecture'],
    title: 'qwen3 model library (Ollama)',
    url: 'https://ollama.com/library/qwen3',
    claim: 'Published tags from 0.6b to 235b with sizes and context windows. Tags include tools and thinking. Installed status is not known from this page.',
    authorityTier: 2,
    checkedOn: CHECKED,
  },
];

export function searchBank(query: string): SearchResult[] {
  const words = query.toLowerCase().split(/\W+/).filter(Boolean);
  return SEARCH_BANK.map((b) => ({ b, score: b.keywords.filter((k) => words.some((w) => w.includes(k) || k.includes(w))).length }))
    .filter((x) => x.score > 0)
    .sort((a, c) => c.score - a.score)
    .slice(0, 5)
    .map(({ b }) => ({
      title: b.title,
      url: b.url,
      provider: 'fixed reference list (not a web search)',
      authorityTier: b.authorityTier,
      snippet: b.claim,
      simulated: true as const,
    }));
}

/** Evidence cards for a simulated research task: the top entries that match the objective. */
export function evidenceFor(objective: string): EvidenceSource[] {
  const hits = searchBank(objective).slice(0, 3);
  return hits.map((h, i) => {
    const entry = SEARCH_BANK.find((b) => b.url === h.url)!;
    return { id: `ev-${i + 1}`, title: entry.title, url: entry.url, authorityTier: entry.authorityTier, checkedOn: entry.checkedOn, claim: entry.claim, simulated: true as const };
  });
}
