import { useState } from 'react';
import type { ProviderInfo, Tier } from '../types/contracts';
import { useObservable, useServices } from '../app/services';
import { Badge, Empty, Panel, SimBadge, fmtTime, pct } from '../components/ui';

const HEALTH_TONE: Record<ProviderInfo['health'], 'ok' | 'warn' | 'error' | 'info' | 'muted'> = {
  up: 'ok',
  degraded: 'warn',
  down: 'error',
  not_configured: 'muted',
  probing: 'info',
};

export function RoutingScreen() {
  const s = useServices();
  const routing = useObservable(s.routing);
  const [testText, setTestText] = useState('');
  const preview = testText.trim() ? s.routing.testRoute(testText) : null;

  return (
    <div className="routing">
      <p className="small muted">
        Routing decides which tier and provider handles a request. Figures below are <strong>simulated</strong>; they are not measured.
      </p>

      <div className="stat-grid">
        <Stat label="Requests (24 h)" value={String(routing.requests24h)} />
        <Stat label="No model call" value={pct(routing.noModelShare)} />
        <Stat label="Median first token" value={`${routing.medianFirstTokenMs} ms`} />
        <Stat label="Fallbacks (24 h)" value={String(routing.fallbacks24h)} />
      </div>

      <Panel title="Providers" actions={<SimBadge />}>
        <table className="table">
          <thead>
            <tr><th>Provider</th><th>Kind</th><th>Endpoint</th><th>Health</th><th>Last probe</th><th>Consent for</th><th /></tr>
          </thead>
          <tbody>
            {routing.providers.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="small">{p.kind}</td>
                <td className="small mono">{p.endpoint}</td>
                <td><Badge tone={HEALTH_TONE[p.health]}>{p.health.replace('_', ' ')}</Badge></td>
                <td className="small">{fmtTime(p.lastProbe)}</td>
                <td className="small">{p.consent.length ? p.consent.join(', ') : 'none'}</td>
                <td>
                  <button type="button" className="btn ghost small" onClick={() => s.routing.probe(p.id)} disabled={p.health === 'probing' || p.health === 'not_configured'}>
                    Probe
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Probe results are fixed for this prototype and do not contact any server.</p>
      </Panel>

      <Panel title="Tier table" actions={<SimBadge />}>
        <table className="table">
          <thead><tr><th>Tier</th><th>Label</th><th>Provider</th><th>Model</th><th>Fallbacks</th></tr></thead>
          <tbody>
            {routing.tiers.map((t) => {
              const provider = routing.providers.find((p) => p.id === t.provider);
              const models = provider?.models ?? [];
              return (
                <tr key={t.tier}>
                  <td><Badge tone={t.tier === 'T0' ? 'ok' : 'info'}>{t.tier}</Badge></td>
                  <td>{t.label}</td>
                  <td>
                    <label className="sr-only" htmlFor={`prov-${t.tier}`}>Provider for {t.tier}</label>
                    <select id={`prov-${t.tier}`} value={t.provider} onChange={(e) => s.routing.setTier(t.tier as Tier, { provider: e.target.value, model: undefined })}>
                      {routing.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`model-${t.tier}`}>Model for {t.tier}</label>
                    <select id={`model-${t.tier}`} value={t.model} disabled={models.length === 0} onChange={(e) => s.routing.setTier(t.tier as Tier, { model: e.target.value })}>
                      {models.length === 0 && <option value={t.model}>{t.model}</option>}
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="small">{t.fallbacks.join(' → ') || 'none'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small muted">Model names marked “candidate” depend on gate G1 (router checkpoint). Changes here are not persisted.</p>
      </Panel>

      <div className="split">
        <Panel title="Route test (preview only)">
          <label htmlFor="route-test" className="small muted">Type a request to see which route it would take. Nothing runs.</label>
          <input id="route-test" value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="e.g. what is 12 * 7" />
          {preview ? (
            <dl className="kv small">
              <dt>Tier</dt><dd>{preview.tier}</dd>
              <dt>Route</dt><dd>{preview.provider}{preview.model ? ` · ${preview.model}` : ' · no model'}</dd>
              <dt>Why</dt><dd>{preview.reason}</dd>
            </dl>
          ) : (
            <Empty>Enter a request above.</Empty>
          )}
          {preview && <p className="small muted">Preview uses the same rules as Conversation, without executing.</p>}
        </Panel>
        <Panel title="Categories" actions={<SimBadge />}>
          <table className="table small">
            <thead><tr><th>Category</th><th>Route</th><th>Success</th><th>Median</th></tr></thead>
            <tbody>
              {routing.categories.map((c) => (
                <tr key={c.category}><td>{c.category}</td><td>{c.route}</td><td>{pct(c.successRate)}</td><td>{c.medianMs < 1000 ? `${c.medianMs} ms` : `${(c.medianMs / 1000).toFixed(0)} s`}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="split">
        <Panel title="Recent routes" actions={<SimBadge />}>
          <table className="table small">
            <thead><tr><th>Time</th><th>Tier</th><th>Provider</th><th>Why</th><th>Outcome</th></tr></thead>
            <tbody>
              {routing.recent.map((r) => (
                <tr key={r.id}>
                  <td>{fmtTime(r.at)}</td>
                  <td>{r.tier}</td>
                  <td>{r.provider}</td>
                  <td>{r.reason}</td>
                  <td><Badge tone={r.outcome === 'ok' ? 'ok' : r.outcome === 'fallback' ? 'warn' : 'error'}>{r.outcome}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Routing events" actions={<SimBadge />}>
          <ul className="events small">
            {routing.events.map((e) => (
              <li key={e.id}>
                <Badge tone={e.severity === 'error' ? 'error' : e.severity === 'warn' ? 'warn' : 'info'}>{e.severity}</Badge>{' '}
                <span className="muted mono">{fmtTime(e.at)}</span> {e.text}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
