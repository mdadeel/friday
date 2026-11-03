// Maps domain values to tone, label and text. Shared by screens and components.
import type { BadgeTone } from '../components/Badge';
import type { ProviderHealth, TaskState, Tier, VoiceSnapshot, AutonomyClass, MemoryItem, Provenance, McpState } from '../types/contracts';
import { en } from '../i18n/en';

export function stateTone(state: TaskState): BadgeTone {
  switch (state) {
    case 'Completed':
      return 'ok';
    case 'Failed':
      return 'error';
    case 'Waiting':
    case 'Recovering':
      return 'warn';
    case 'Cancelled':
    case 'Idle':
      return 'muted';
    default:
      return 'accent';
  }
}

export function isActive(state: TaskState): boolean {
  return !['Idle', 'Completed', 'Failed', 'Cancelled'].includes(state);
}

export function healthTone(h: ProviderHealth): BadgeTone {
  switch (h) {
    case 'up':
      return 'ok';
    case 'degraded':
    case 'probing':
      return 'warn';
    case 'down':
      return 'error';
    default:
      return 'muted';
  }
}

export const HEALTH_LABEL: Record<ProviderHealth, string> = {
  up: 'Up',
  degraded: 'Degraded',
  down: 'Down',
  not_configured: 'Not configured',
  probing: 'Probing',
};

export function tierTone(tier: Tier): BadgeTone {
  return tier === 'T0' || tier === 'T1' ? 'ok' : tier === 'T2' ? 'accent' : 'violet';
}

export function autonomyTone(a: AutonomyClass): BadgeTone {
  switch (a) {
    case 'automatic':
      return 'ok';
    case 'policy_controlled':
      return 'accent';
    case 'confirm_required':
      return 'warn';
    default:
      return 'error';
  }
}

export const AUTONOMY_LABEL: Record<AutonomyClass, string> = {
  automatic: 'Automatic',
  policy_controlled: 'Policy controlled',
  confirm_required: 'Confirmation required',
  blocked: 'Blocked',
};

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  explicit: 'Explicit',
  inferred: 'Inferred',
  temporary: 'Temporary',
  assumption: 'Assumption',
  outdated: 'Outdated',
};

export function provenanceTone(p: Provenance): BadgeTone {
  return p === 'explicit' ? 'ok' : p === 'inferred' || p === 'assumption' ? 'warn' : p === 'outdated' ? 'muted' : 'accent';
}

export function mcpTone(s: McpState): BadgeTone {
  return s === 'ready' ? 'ok' : s === 'starting' || s === 'degraded' ? 'warn' : s === 'unavailable' ? 'error' : 'muted';
}

export function voiceTone(s: VoiceSnapshot['state']): BadgeTone {
  if (s === 'Listening' || s === 'Speaking') return 'accent';
  if (s === 'Interrupted') return 'warn';
  return 'muted';
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' }).format(new Date(iso));
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' }).format(new Date(iso));
}

export function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function stateLabel(state: TaskState): string {
  return en.state[state];
}

export function memoryHeadline(m: MemoryItem): string {
  return m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content;
}
