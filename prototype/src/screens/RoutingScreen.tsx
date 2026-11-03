import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { pct } from '../app/presentation';
import { StatTile } from '../components/StatTile';
import { RoutingTiers } from '../components/RoutingTiers';
import { RoutingProviders } from '../components/RoutingProviders';
import { RoutingRecent } from '../components/RoutingRecent';
import { DataTable, type Column } from '../components/DataTable';
import { Timeline } from '../components/Timeline';
import { SimBadge } from '../components/SimBadge';
import type { CategoryStat } from '../types/contracts';

/** Routing dashboard: summary, tier table, providers and models, categories, recent routes and fallback timeline. */
export function RoutingScreen() {
  const { routing } = useServices();
  const r = useObservable(routing);
  const categoryColumns: Column<CategoryStat & { id: string }>[] = [
    { key: 'c', header: 'Task category', render: (c) => c.category },
    { key: 'r', header: 'Selected route', render: (c) => c.route },
    { key: 's', header: 'Success rate', align: 'right', render: (c) => pct(c.successRate) },
    { key: 'm', header: 'Median latency', align: 'right', render: (c) => `${c.medianMs} ms` },
  ];
  const categoryRows = r.categories.map((c) => ({ ...c, id: c.category }));

  return (
    <div className="stack screen">
      <p className="screen-intro">{en.routing.intro}</p>
      <div className="row gap wrap">
        <SimBadge />
        <span className="small faint">All figures on this screen are simulated.</span>
      </div>
      <div className="stat-grid">
        <StatTile label={en.routing.requests} value={String(r.requests24h)} note="prototype session" />
        <StatTile label={en.routing.noModel} value={pct(r.noModelShare)} note="Tier 0/1 share" />
        <StatTile label={en.routing.latency} value={`${r.medianFirstTokenMs} ms`} />
        <StatTile label={en.routing.fallbacks} value={String(r.fallbacks24h)} />
      </div>
      <section className="panel" aria-labelledby="tiers-h">
        <h2 id="tiers-h">{en.routing.tiers}</h2>
        <RoutingTiers tiers={r.tiers} providers={r.providers} models={r.models} />
      </section>
      <section className="panel" aria-labelledby="prov-section">
        <h2 id="prov-section" className="sr-only">
          Providers and models
        </h2>
        <RoutingProviders providers={r.providers} models={r.models} />
      </section>
      <section className="panel" aria-labelledby="cat-h">
        <h2 id="cat-h">{en.routing.categories}</h2>
        <DataTable caption="Route by task category" columns={categoryColumns} rows={categoryRows} />
      </section>
      <section className="panel" aria-labelledby="recent-h">
        <h2 id="recent-h">{en.routing.recent}</h2>
        <RoutingRecent routes={r.recent} />
      </section>
      <section className="panel" aria-labelledby="events-h">
        <h2 id="events-h">{en.routing.events}</h2>
        <Timeline events={r.events} />
      </section>
    </div>
  );
}
