import { useObservable, useServices } from '../../app/services';
import { HEALTH_LABEL, healthTone } from '../../app/presentation';
import { StatusDot } from '../../components/StatusDot';
import { Badge } from '../../components/Badge';
import { SimBadge } from '../../components/SimBadge';

/** Providers: state, data-class consent and a test-connection button (simulated probe, no network). */
export function ProvidersPanel() {
  const { routing } = useServices();
  const providers = useObservable(routing).providers;
  return (
    <div className="panel stack">
      <div className="row gap"><h3>Providers</h3><SimBadge compact /></div>
      <ul className="stack gap-tight">
        {providers.map((p) => (
          <li key={p.id} className="row between wrap gap">
            <div className="stack gap-tight">
              <span>
                {p.name} <Badge tone="muted">{p.kind === 'cloud' ? 'Cloud' : 'Local'}</Badge>
              </span>
              <span className="small faint">
                Data sent: {p.consent.length ? p.consent.join(', ') : 'nothing (local only)'} · endpoint <code>{p.endpoint}</code>
              </span>
            </div>
            <div className="row gap">
              <StatusDot tone={healthTone(p.health)} label={HEALTH_LABEL[p.health]} />
              <button type="button" className="btn btn-small" onClick={() => routing.probe(p.id)} disabled={p.health === 'probing'}>
                Test connection
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="small faint">Secret references are names only. No secret is stored or read by the prototype. Cloud spend limit is 0 by default.</p>
    </div>
  );
}
