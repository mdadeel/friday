import { en } from '../i18n/en';
import type { LocalModel, ProviderInfo } from '../types/contracts';
import { useServices } from '../app/services';
import { HEALTH_LABEL, healthTone, fmtDateTime } from '../app/presentation';
import { StatusDot } from './StatusDot';
import { Badge } from './Badge';

/** Provider status and the published model catalogue. A probe never touches the network; loading is not available here. */
export function RoutingProviders({ providers, models }: { providers: ProviderInfo[]; models: LocalModel[] }) {
  const { routing } = useServices();
  return (
    <div className="grid-cards">
      <section className="panel" aria-labelledby="prov-h">
        <h3 id="prov-h">{en.routing.providers}</h3>
        <ul className="stack gap-tight">
          {providers.map((p) => (
            <li key={p.id} className="row between wrap gap provider-row">
              <div className="stack gap-tight">
                <span>
                  {p.name} <span className="faint small">{p.kind.replace('_', ' ')}</span>
                </span>
                <span className="small faint mono">{p.endpoint}</span>
              </div>
              <div className="row gap wrap">
                <StatusDot tone={healthTone(p.health)} label={HEALTH_LABEL[p.health]} pulse={p.health === 'probing'} />
                <span className="small faint">{p.lastProbe ? fmtDateTime(p.lastProbe) : 'never probed'}</span>
                <button type="button" className="btn btn-small" disabled={p.health === 'probing'} onClick={() => routing.probe(p.id)}>
                  {en.routing.probe}
                </button>
                {p.reason ? <span className="small faint">{p.reason}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" aria-labelledby="models-h">
        <h3 id="models-h">{en.routing.models}</h3>
        <ul className="stack gap-tight">
          {models.map((m) => (
            <li key={m.id} className="row between wrap gap">
              <div className="stack gap-tight">
                <span className="mono">{m.name}</span>
                <span className="small faint">
                  {m.sizeLabel} · {m.context} context · {m.capabilities.join(', ')}
                </span>
              </div>
              <div className="row gap">
                <Badge tone="muted">{en.routing.notChecked}</Badge>
                <button type="button" className="btn btn-small" disabled title={en.routing.loadDisabled}>
                  Load
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="small faint">{en.routing.catalogueNote}</p>
        <p className="small faint">{en.routing.loadDisabled}</p>
      </section>
    </div>
  );
}
