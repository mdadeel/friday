import { useSyncExternalStore } from 'react';

export const ROUTE_NAMES = ['chat', 'activity', 'memory', 'capabilities', 'routing', 'settings', 'overlay'] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

export interface ParsedRoute {
  name: RouteName;
  section?: string;
}

/** Parses "#/settings/voice" into { name: 'settings', section: 'voice' }. Unknown routes fall back to chat. */
export function parseHash(hash: string): ParsedRoute {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = (ROUTE_NAMES as readonly string[]).includes(parts[0] ?? '') ? (parts[0] as RouteName) : 'chat';
  return { name, section: parts[1] };
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute(): ParsedRoute {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return parseHash(hash);
}

export function navigate(path: string): void {
  window.location.hash = path;
}
