import { Store } from '../store';
import type { DiagnosticsService, RoutingService } from '../contracts';
import type { ProviderInfo, RouteInfo, RoutingState, Tier } from '../../types/contracts';
import { seedCategories, seedModels, seedProviders, seedRecentRoutes, seedRoutingEvents, seedTiers } from '../../data/seed';
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
  const store = new Store<RoutingState>({
    providers: seedProviders,
    models: seedModels,
    tiers: seedTiers,
    categories: seedCategories,
    recent: seedRecentRoutes,
    events: seedRoutingEvents,
    requests24h: 128,
    noModelShare: 0.31,
    medianFirstTokenMs: 740,
    fallbacks24h: 6,
    simulated: true,
  });

  const record = (route: RouteInfo): void => {
    store.set((s) => ({
      ...s,
      recent: [route, ...s.recent].slice(0, 25),
      requests24h: s.requests24h + 1,
      fallbacks24h: route.outcome === 'fallback' ? s.fallbacks24h + 1 : s.fallbacks24h,
      events:
        route.outcome === 'fallback'
          ? [{ id: nextId('ev'), at: nowIso(), severity: 'warn' as const, kind: 'fallback' as const, text: `Fallback used for ${route.category} (simulated).` }, ...s.events].slice(0, 30)
          : s.events,
    }));
  };

  const addEvent = (s: RoutingState, text: string, severity: 'info' | 'warn' | 'error', kind: RoutingState['events'][number]['kind']): RoutingState['events'] =>
    [{ id: nextId('ev'), at: nowIso(), severity, kind, text }, ...s.events].slice(0, 30);

  const setTier = (tier: Tier, patch: { provider?: string; model?: string }): void => {
    store.set((s) => ({
      ...s,
      tiers: s.tiers.map((t) => (t.tier === tier ? { ...t, provider: patch.provider ?? t.provider, model: patch.model ?? t.model } : t)),
      events: addEvent(s, `${tier} route changed in the prototype (not persisted).`, 'info', 'route_change'),
    }));
    diag.log('router', 'info', `${tier} route changed (simulated)`);
  };

  const setFallbacks = (tier: Tier, fallbacks: string[]): void => {
    store.set((s) => ({
      ...s,
      tiers: s.tiers.map((t) => (t.tier === tier ? { ...t, fallbacks } : t)),
      events: addEvent(s, `${tier} fallback order changed (not persisted).`, 'info', 'route_change'),
    }));
  };

  const setModelLoaded = (id: string, loaded: boolean): void => {
    store.set((s) => ({
      ...s,
      models: s.models.map((m) => (m.id === id ? { ...m, loaded } : m)),
      events: addEvent(s, `${s.models.find((m) => m.id === id)?.name ?? id} ${loaded ? 'loaded' : 'unloaded'} (simulated, nothing started).`, 'info', 'route_change'),
    }));
  };

  const probe = (providerId: string): void => {
    store.set((s) => ({ ...s, providers: s.providers.map((p) => (p.id === providerId ? { ...p, health: 'probing' as const } : p)) }));
    setTimeout(() => {
      const result = PROBE_RESULT[providerId] ?? 'down';
      store.set((s) => ({
        ...s,
        providers: s.providers.map((p) => (p.id === providerId ? { ...p, health: result, lastProbe: nowIso() } : p)),
        events: addEvent(s, `Probe ${providerId}: ${result} (simulated, no network call).`, result === 'up' ? 'info' : 'warn', 'probe'),
      }));
      diag.log('models', 'info', `probe ${providerId}: ${result} (simulated)`);
    }, 900);
  };

  const testRoute = (text: string): RouteInfo | null => {
    if (!text.trim()) return null;
    return buildRoute('preview', nowIso(), classifyIntent(text), 0);
  };

  return { get: store.get, subscribe: store.subscribe, record, setTier, setFallbacks, setModelLoaded, probe, testRoute };
}
