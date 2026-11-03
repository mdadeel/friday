// Pure simulation logic. No I/O, no timers. Covered by tests/logic.test.ts.
// Everything here is a rule-based stand-in for EDITH's router, planner and memory
// policy described in docs/edith. It is NOT intelligence.

import type {
  MemoryItem,
  RouteInfo,
  TaskIntent,
  Tier,
  VerificationMode,
} from '../../types/contracts';

export const DISPLAY_TZ = 'Asia/Dhaka';

/** Deterministic Tier 0 matcher. Returns null when a model would be needed. */
export function tier0Match(text: string): { intent: 'time' | 'date' | 'calc'; expr?: string } | null {
  const t = text.trim().toLowerCase();
  if (/\b(what(?:'s| is) the time|what time|current time|time is it|time now)\b/.test(t)) {
    return { intent: 'time' };
  }
  if (/\b(what(?:'s| is) (?:the )?date|what day is|today'?s date|what day)\b/.test(t)) {
    return { intent: 'date' };
  }
  const m = t.match(/^(?:calc(?:ulate)?|what is|what's)?\s*([0-9][0-9\s+\-*/().%^]*)$/);
  if (m && /[+\-*/%^]/.test(m[1])) {
    return { intent: 'calc', expr: m[1].trim() };
  }
  return null;
}

/** Safe arithmetic evaluator: numbers, + - * / % ^, parentheses. No eval. */
export function evaluateExpression(expr: string): number {
  // Sticky tokeniser: whitespace separates tokens, so "2 3" is two numbers (and rejected).
  const tokens: string[] = [];
  const token = /\s*(\d+(?:\.\d+)?|[()+\-*/%^])/y;
  const src = expr.trim();
  let cursor = 0;
  while (cursor < src.length) {
    token.lastIndex = cursor;
    const m = token.exec(src);
    if (!m) throw new Error('unsupported characters in expression');
    tokens.push(m[1]);
    cursor = token.lastIndex;
  }
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const next = (): string | undefined => tokens[pos++];

  const parsePrimary = (): number => {
    const t = next();
    if (t === '(') {
      const v = parseExpr();
      if (next() !== ')') throw new Error('missing closing parenthesis');
      return v;
    }
    if (t === undefined || !/^\d/.test(t)) throw new Error('unexpected token');
    return Number(t);
  };
  const parseUnary = (): number => {
    if (peek() === '-') {
      next();
      return -parseUnary();
    }
    return parsePrimary();
  };
  const parseFactor = (): number => {
    const base = parseUnary();
    if (peek() === '^') {
      next();
      return base ** parseFactor();
    }
    return base;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const r = parseFactor();
      if (op === '*') v *= r;
      else if (op === '/') {
        if (r === 0) throw new Error('division by zero');
        v /= r;
      } else {
        if (r === 0) throw new Error('division by zero');
        v %= r;
      }
    }
    return v;
  };
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('unexpected trailing input');
  return result;
}

export function classifyIntent(text: string): TaskIntent {
  const tier0 = tier0Match(text);
  if (tier0) return tier0.intent;
  const t = text.toLowerCase();
  if (/\bwho am i\b|what do you know about me|about me\b/.test(t)) return 'personal';
  if (/\bcontinue\b|yesterday|where did i stop|what was i working on/.test(t)) return 'continue';
  if (/\bresearch\b|compare|best architecture|recommend|alternatives/.test(t)) return 'research';
  if (/\bfix\b|repo\b|repository|\bbug\b|failing test|authentication|\bauth\b/.test(t)) return 'code';
  return 'chat';
}

/** Formats a date in the owner's timezone using the platform's Intl data. */
export function formatInDisplayTz(date: Date, kind: 'time' | 'date'): string {
  if (kind === 'time') {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: DISPLAY_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TZ,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** Who-am-I answer: only explicit or user-confirmed semantic facts are used. */
export function answerWhoAmI(items: MemoryItem[]): { text: string; usedIds: string[] } {
  const confirmed = items.filter(
    (m) =>
      m.status === 'active' &&
      m.category === 'semantic' &&
      (m.provenance === 'explicit' || m.userConfirmed),
  );
  if (confirmed.length === 0) {
    return {
      text:
        'I do not have confirmed information about you yet. Tell me facts you want me to keep, ' +
        'and I will store them as explicit memory you can review.',
      usedIds: [],
    };
  }
  return {
    text: 'From what you have confirmed: ' + confirmed.map((m) => m.content).join(' '),
    usedIds: confirmed.map((m) => m.id),
  };
}

export interface RouteRule {
  tier: Tier;
  provider: string;
  model: string | null;
  fallbacks: string[];
  reason: string;
  category: string;
}

/** Simulated route table: the same mapping the real router would derive from config. */
export function routeRuleFor(intent: TaskIntent): RouteRule {
  switch (intent) {
    case 'time':
    case 'date':
    case 'calc':
      return {
        tier: 'T0',
        provider: 'native',
        model: null,
        fallbacks: [],
        reason: 'Deterministic utility; no model call',
        category: 'Deterministic',
      };
    case 'personal':
      return {
        tier: 'T2',
        provider: 'ollama',
        model: 'qwen3 · 8B (candidate)',
        fallbacks: ['llama_cpp'],
        reason: 'Memory-grounded answer; explicit facts only',
        category: 'Personal memory',
      };
    case 'research':
      return {
        tier: 'T3',
        provider: 'ollama',
        model: 'qwen3 · 32B (candidate)',
        fallbacks: ['llama_cpp', 'T2 local model'],
        reason: 'Multi-step research; deep reasoning; evidence verification',
        category: 'Research',
      };
    case 'code':
      return {
        tier: 'T3',
        provider: 'ollama',
        model: 'qwen3 · 32B (candidate)',
        fallbacks: ['llama_cpp', 'T2 local model'],
        reason: 'Multi-step coding task; mechanical verification required',
        category: 'Coding',
      };
    case 'continue':
      return {
        tier: 'T2',
        provider: 'ollama',
        model: 'qwen3 · 8B (candidate)',
        fallbacks: ['llama_cpp'],
        reason: 'Episodic retrieval and summary',
        category: 'Continuation',
      };
    case 'chat':
    default:
      return {
        tier: 'T2',
        provider: 'ollama',
        model: 'qwen3 · 8B (candidate)',
        fallbacks: ['llama_cpp'],
        reason: 'Standard conversation',
        category: 'Conversation',
      };
  }
}

/** Local providers keep data on this machine; cloud providers send it out. */
export function localityOf(provider: string): 'Local' | 'Cloud' {
  return provider === 'cloud_llm' || provider === 'gemini_live' ? 'Cloud' : 'Local';
}

export function buildRoute(id: string, at: string, intent: TaskIntent, latencyMs: number): RouteInfo {
  const rule = routeRuleFor(intent);
  return {
    id,
    at,
    tier: rule.tier,
    provider: rule.provider,
    model: rule.model,
    dataClass: 'Personal',
    locality: localityOf(rule.provider),
    reason: rule.reason,
    fallbacks: rule.fallbacks,
    latencyMs,
    category: rule.category,
    outcome: 'ok',
    simulated: true,
  };
}

export interface PlanSeed {
  label: string;
  capability: string;
  kind: 'tool' | 'model';
  deps: number[]; // indexes into the same list
  tier: Tier;
  needsApproval?: boolean;
  failOnce?: boolean;
  ticks: number;
}

export interface PlanTemplate {
  verification: VerificationMode;
  criteria: string[];
  subtasks: PlanSeed[];
}

/** Plans per intent. Dependencies are indexes; the scheduler runs independent steps in parallel. */
export function planFor(intent: TaskIntent): PlanTemplate {
  switch (intent) {
    case 'research':
      return {
        verification: 'evidence',
        criteria: ['Every claim maps to a retrieved source span', 'Alternatives compared with stated criteria'],
        subtasks: [
          { label: 'Retrieve project memory', kind: 'tool', capability: 'native:memory.search', deps: [], tier: 'T0', ticks: 2 },
          { label: 'Search: official SDK documentation', kind: 'tool', capability: 'native:search.web', deps: [], tier: 'T4', ticks: 3 },
          { label: 'Search: alternatives and benchmarks', kind: 'tool', capability: 'native:search.web', deps: [], tier: 'T4', ticks: 3, failOnce: true },
          { label: 'Read top sources', kind: 'tool', capability: 'native:fetch.url', deps: [1, 2], tier: 'T4', ticks: 3 },
          { label: 'Compare alternatives', kind: 'model', capability: 'model:reasoning', deps: [0, 3], tier: 'T3', ticks: 4 },
          { label: 'Draft recommendation', kind: 'model', capability: 'model:reasoning', deps: [4], tier: 'T3', ticks: 3 },
          { label: 'Verify claims against evidence', kind: 'model', capability: 'model:verifier', deps: [5], tier: 'T2', ticks: 2 },
          { label: 'Propose memory updates', kind: 'tool', capability: 'native:memory.propose', deps: [6], tier: 'T1', ticks: 1 },
        ],
      };
    case 'code':
      return {
        verification: 'mechanical',
        criteria: ['Test suite passes after the patch', 'Changed files stay within the approved limit'],
        subtasks: [
          { label: 'Locate authentication code', kind: 'tool', capability: 'native:fs.read', deps: [], tier: 'T2', ticks: 2 },
          { label: 'Reproduce failing test', kind: 'tool', capability: 'native:process.run_template', deps: [0], tier: 'T0', ticks: 2 },
          { label: 'Propose patch', kind: 'model', capability: 'model:reasoning', deps: [1], tier: 'T3', ticks: 4 },
          { label: 'Apply patch to project files', kind: 'tool', capability: 'native:fs.write', deps: [2], tier: 'T0', ticks: 2, needsApproval: true },
          { label: 'Run project tests', kind: 'tool', capability: 'native:process.run_template', deps: [3], tier: 'T0', ticks: 3 },
          { label: 'Verify test result', kind: 'model', capability: 'model:verifier', deps: [4], tier: 'T2', ticks: 1 },
        ],
      };
    case 'continue':
      return {
        verification: 'evidence',
        criteria: ['Stopping point identified from stored evidence', 'Discrepancies reported'],
        subtasks: [
          { label: 'Retrieve episodic memory', kind: 'tool', capability: 'native:memory.search', deps: [], tier: 'T0', ticks: 2 },
          { label: 'Check project state (git status)', kind: 'tool', capability: 'native:git.status', deps: [], tier: 'T0', ticks: 2 },
          { label: 'Identify stopping point', kind: 'model', capability: 'model:reasoning', deps: [0, 1], tier: 'T2', ticks: 2 },
          { label: 'Resume plan', kind: 'model', capability: 'model:reasoning', deps: [2], tier: 'T2', ticks: 2 },
        ],
      };
    default:
      return {
        verification: 'none_declared',
        criteria: [],
        subtasks: [{ label: 'Answer', kind: 'model', capability: 'model:chat', deps: [], tier: 'T2', ticks: 2 }],
      };
  }
}

export function verificationLabel(mode: VerificationMode): string {
  switch (mode) {
    case 'mechanical':
      return 'Mechanical (tests, hashes)';
    case 'evidence':
      return 'Evidence (claims ↔ sources)';
    case 'user_confirmed':
      return 'User-confirmed';
    case 'none_declared':
      return 'None declared — shown as unverified';
  }
}
