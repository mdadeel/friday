import { Store } from '../store';
import type { DiagnosticsService, RoutingService } from '../contracts';
import type { ProviderInfo, RouteInfo, RoutingState, Tier } from '../../types/contracts';
import { seedCategories, seedProviders, seedRecentRoutes, seedRoutingEvents, seedTiers } from '../../data/seed';
import { classifyIntent, buildRoute } from './logic';
import { nextId, nowIso } from './ids';

/** Probe outcomes are fixed so the prototype is repeatable. They are simulated, not measured. */
const PROBE_RESULT: Record<string, ProviderInfo['health']> = {
  native: 'up',
  ollama: 'up',
  llama_cpp: 'down',
  cloud_llm: 'not_configured',
  gemini_live: 'not_configured',
  searxng: 'up',
};

export function createRoutingService(diag: DiagnosticsService): RoutingService {
  const initial: RoutingState = {
    providers: seedProviders,
    tiers: seedTiers,
    categories: seedCategories,
    recent: seedRecentRoutes,
    events: seedRoutingEvents,
    requests24h: 128,
    noModelShare: 0.31,
    medianFirstTokenMs: 740,
    fallbacks24h: 6,
    simulated: true,
  };
  const store = new Store<RoutingState>(initial);

  const record = (route: RouteInfo): void => {
    store.set((s) => ({
      ...s,
      recent: [route, ...s.recent].slice(0, 25),
      requests24h: s.requests24h + 1,
      fallbacks24h: route.outcome === 'fallback' ? s.fallbacks24h + 1 : s.fallbacks24h,
      events:
        route.outcome === 'fallback'
          ? [{ id: nextId('ev'), at: nowIso(), severity: 'warn' as const, text: `Fallback used for ${route.category ?? 'request'} (simulated).` }, ...s.events].slice(0, 20)
          : s.events,
    }));
  };

  const setTier = (tier: Tier, patch: { provider?: string; model?: string }): void => {
    store.set((s) => ({
      ...s,
      tiers: s.tiers.map((t) => (t.tier === tier ? { ...t, provider: patch.provider ?? t.provider, model: patch.model ?? t.model } : t)),
      events: [{ id: nextId('ev'), at: nowIso(), severity: 'info' as const, text: `${tier} route changed in prototype (not persisted).` }, ...s.events].slice(0, 20),
    }));
    diag.log('router', 'info', `${tier} route changed (simulated)`);
  };

  const probe = (providerId: string): void => {
    store.set((s) => ({ ...s, providers: s.providers.map((p) => (p.id === providerId ? { ...p, health: 'probing' as const } : p)) }));
    setTimeout(() => {
      store.set((s) => ({
        ...s,
        providers: s.providers.map((p) =>
          p.id === providerId ? { ...p, health: PROBE_RESULT[providerId] ?? 'down', lastProbe: nowIso() } : p,
        ),
      }));
      diag.log('models', 'info', `probe ${providerId}: ${PROBE_RESULT[providerId] ?? 'down'} (simulated)`);
    }, 900);
  };

  const testRoute = (text: string): RouteInfo | null => {
    if (!text.trim()) return null;
    return buildRoute('preview', nowIso(), classifyIntent(text), 0);
  };

  return { get: store.get, subscribe: store.subscribe, record, setTier, probe, testRoute };
}
