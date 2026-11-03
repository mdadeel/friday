import { useObservable, useServices } from '../app/services';
import { Badge, fmtTime } from '../components/ui';

/** Read-only provider list with consent classes. Used by Settings. */
export function ProvidersTable() {
  const s = useServices();
  const routing = useObservable(s.routing);
  return (
    <table className="table small">
      <thead><tr><th>Provider</th><th>Health</th><th>Last probe</th><th>Consent for</th></tr></thead>
      <tbody>
        {routing.providers.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td><Badge tone={p.health === 'up' ? 'ok' : p.health === 'down' ? 'error' : p.health === 'degraded' ? 'warn' : 'muted'}>{p.health.replace('_', ' ')}</Badge></td>
            <td>{fmtTime(p.lastProbe)}</td>
            <td>{p.consent.length ? p.consent.join(', ') : 'none granted'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
