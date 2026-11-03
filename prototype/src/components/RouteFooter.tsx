import { useState } from 'react';
import type { RouteInfo } from '../types/contracts';
import { en } from '../i18n/en';
import { Chip } from './Chip';
import { Badge } from './Badge';
import { SimBadge } from './SimBadge';
import { Dialog } from './Dialog';
import { tierTone } from '../app/presentation';

/** Route footer for every EDITH answer: tier, route, data class, locality, and whether anything ran. Click opens detail. */
export function RouteFooter({ route }: { route: RouteInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="route-footer" aria-label="Route">
        <Badge tone={tierTone(route.tier)}>{`${en.route.tier} ${route.tier.slice(1)}`}</Badge>
        <Chip label={`${en.route.detail}: ${route.model ?? en.route.noModel}`} onClick={() => setOpen(true)}>
          {route.model ?? en.route.noModel}
        </Chip>
        <Chip>{route.dataClass}</Chip>
        <Chip>{route.locality === 'Local' ? en.route.local : en.route.cloud}</Chip>
        <Chip>{route.executedBy === 'browser' ? en.route.ranInBrowser : en.route.noModelCalled}</Chip>
        <SimBadge compact />
      </div>
      {open ? (
        <Dialog title={en.route.detail} onClose={() => setOpen(false)}>
          <dl className="kv">
            <dt>Route ID</dt>
            <dd className="mono">{route.id}</dd>
            <dt>Category</dt>
            <dd>{route.category}</dd>
            <dt>{en.route.tier}</dt>
            <dd>{route.tier}</dd>
            <dt>Provider</dt>
            <dd>{route.provider}</dd>
            <dt>Model</dt>
            <dd>{route.model ?? en.route.noModel}</dd>
            <dt>{en.activity.locality}</dt>
            <dd>{route.locality}</dd>
            <dt>{en.activity.dataClass}</dt>
            <dd>{route.dataClass}</dd>
            <dt>{en.route.reason}</dt>
            <dd>{route.reason}</dd>
            <dt>{en.route.fallbacks}</dt>
            <dd>{route.fallbacks.length ? route.fallbacks.join(' → ') : en.route.none}</dd>
            <dt>Outcome</dt>
            <dd>{route.outcome}</dd>
            <dt>Executed by</dt>
            <dd>{route.executedBy === 'browser' ? en.route.ranInBrowser : en.route.noModelCalled}</dd>
          </dl>
          <p className="small faint">Simulated route decision. Nothing was sent to a model or provider.</p>
        </Dialog>
      ) : null}
    </>
  );
}
