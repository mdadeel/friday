import { Store } from '../store';
import type { DiagnosticsService, RoutingService } from '../contracts';
import type { ProviderInfo, RouteInfo, RoutingState, Tier } from '../../types/contracts';
import { seedCategories, seedModels, seedProviders, seedRecentRoutes, seedRoutingEvents, seedTiers } from '../../data/seed';
import { classifyIntent, buildRoute, routeRuleFor } from './logic';
import { nextId, nowIso } from './ids';

/**
 * A probe never contacts a provider. The prototype has no provider client, so every probe reports
 * 'unknown' with the reason. Built-in utilities run in the browser, so they are 'up' by construction.
 */
function probeOutcome(p: ProviderInfo): { health: ProviderInfo['health']; reason: string } {
  if (p.kind === 'native') return { health: 'up', reason: 'Runs in this browser tab (Tier 0).' };
  if (p.health === 'not_configured') return { health: 'not_configured', reason: p.reason };
  return { health: 'unknown', reason: 'Not probed: no provider client in the prototype. Nothing was contacted.' };
}

export function createRoutingService(diag: DiagnosticsService): RoutingService {
  const store = new Store<RoutingState>({
    providers: seedProviders,
    models: seedModels,
    tiers: seedTiers,
    categories: seedCategories,
    recent: seedRecentRoutes,
    events: seedRoutingEvents,
    sessionRequests: 0,
    browserAnswered: 0,
    modelCalls: 0,
    fallbacks: 0,
    simulated: true,
  });

  const addEvent = (s: RoutingState, text: string, severity: 'info' | 'warn' | 'error', kind: RoutingState['events'][number]['kind']): RoutingState['events'] =>
    [{ id: nextId('ev'), at: nowIso(), severity, kind, text }, ...s.events].slice(0, 30);

  const record = (route: RouteInfo): void => {
    store.set((s) => ({
      ...s,
      recent: [route, ...s.recent].slice(0, 25),
      sessionRequests: s.sessionRequests + 1,
      browserAnswered: route.executedBy === 'browser' ? s.browserAnswered + 1 : s.browserAnswered,
      modelCalls: s.modelCalls, // no provider client exists, so no model call is ever made
      fallbacks: route.outcome === 'fallback' ? s.fallbacks + 1 : s.fallbacks,
      categories: s.categories.map((c) => (c.category === route.category ? { ...c, route: `${route.tier} · ${route.provider}`, calls: c.calls + 1 } : c)),
      events:
        route.outcome === 'fallback'
          ? addEvent(s, `Fallback recorded for ${route.category}.`, 'warn', 'fallback')
          : s.events,
    }));
  };

  const setTier = (tier: Tier, patch: { provider?: string; model?: string }): void => {
    store.set((s) => ({
      ...s,
      tiers: s.tiers.map((t) => (t.tier === tier ? { ...t, provider: patch.provider ?? t.provider, model: patch.model ?? t.model } : t)),
      events: addEvent(s, `${tier} route changed in this session (not saved).`, 'info', 'route_change'),
    }));
    diag.log('router', 'info', `${tier} route changed (session only)`);
  };

  const setFallbacks = (tier: Tier, fallbacks: string[]): void => {
    store.set((s) => ({
      ...s,
      tiers: s.tiers.map((t) => (t.tier === tier ? { ...t, fallbacks } : t)),
      events: addEvent(s, `${tier} fallback order changed (session only).`, 'info', 'route_change'),
    }));
  };

  const probe = (providerId: string): void => {
    const p = store.get().providers.find((x) => x.id === providerId);
    if (!p) return;
    const out = probeOutcome(p);
    store.set((s) => ({
      ...s,
      providers: s.providers.map((x) => (x.id === providerId ? { ...x, health: out.health, reason: out.reason, lastProbe: nowIso() } : x)),
      events: addEvent(s, `Probe ${p.name}: ${out.health}. ${out.reason}`, out.health === 'up' ? 'info' : 'warn', 'probe'),
    }));
    diag.log('models', 'info', `probe ${providerId}: ${out.health}`);
  };

  const testRoute = (text: string): RouteInfo | null => {
    if (!text.trim()) return null;
    const intent = classifyIntent(text);
    if (!routeRuleFor(intent)) return null;
    return buildRoute('preview', nowIso(), intent);
  };

  return { get: store.get, subscribe: store.subscribe, record, setTier, setFallbacks, probe, testRoute };
}
