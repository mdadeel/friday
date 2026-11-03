import { useMemo, useState } from 'react';
import type { RouteInfo, Tier } from '../types/contracts';
import { en } from '../i18n/en';
import { DataTable, type Column } from './DataTable';
import { Badge } from './Badge';
import { SelectField } from './SelectField';
import { fmtDateTime, tierTone } from '../app/presentation';

/** Recent routes with filters by tier, provider and data class. */
export function RoutingRecent({ routes }: { routes: RouteInfo[] }) {
  const [tier, setTier] = useState('all');
  const [provider, setProvider] = useState('all');
  const [dataClass, setDataClass] = useState('all');
  const providers = Array.from(new Set(routes.map((r) => r.provider)));
  const rows = useMemo(
    () => routes.filter((r) => (tier === 'all' || r.tier === (tier as Tier)) && (provider === 'all' || r.provider === provider) && (dataClass === 'all' || r.dataClass === dataClass)),
    [routes, tier, provider, dataClass],
  );
  const columns: Column<RouteInfo>[] = [
    { key: 'at', header: 'Time', render: (r) => <span className="small mono">{fmtDateTime(r.at)}</span> },
    { key: 'cat', header: 'Category', render: (r) => r.category },
    { key: 'tier', header: 'Tier', render: (r) => <Badge tone={tierTone(r.tier)}>{r.tier}</Badge> },
    { key: 'model', header: 'Route', render: (r) => <span>{r.provider} · {r.model ?? en.route.noModel}</span> },
    { key: 'exec', header: 'Executed by', render: (r) => (r.executedBy === 'browser' ? en.route.ranInBrowser : en.route.noModelCalled) },
    { key: 'dc', header: 'Data', render: (r) => `${r.dataClass} · ${r.locality}` },
    { key: 'out', header: 'Outcome', render: (r) => <Badge tone={r.outcome === 'ok' ? 'ok' : r.outcome === 'fallback' ? 'warn' : 'error'}>{r.outcome}</Badge> },
  ];
  return (
    <div className="stack">
      <div className="row gap wrap filters">
        <SelectField label={en.routing.filters.tier} value={tier} onChange={setTier} options={[['all', en.memory.all], ['T0', 'T0'], ['T1', 'T1'], ['T2', 'T2'], ['T3', 'T3'], ['T4', 'T4']]} />
        <SelectField label={en.routing.filters.provider} value={provider} onChange={setProvider} options={[['all', en.memory.all], ...providers.map((p) => [p, p] as [string, string])]} />
        <SelectField label={en.routing.filters.dataClass} value={dataClass} onChange={setDataClass} options={[['all', en.memory.all], ['Public', 'Public'], ['Personal', 'Personal'], ['Project', 'Project'], ['Secret', 'Secret']]} />
      </div>
      <DataTable caption="Recent routing decisions" columns={columns} rows={rows} empty="No routes match these filters." />
    </div>
  );
}
