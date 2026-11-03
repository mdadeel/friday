import { useObservable, useServices } from '../../app/services';
import { mcpTone } from '../../app/presentation';
import { StatusDot } from '../../components/StatusDot';
import { Toggle } from '../../components/Toggle';
import { SimBadge } from '../../components/SimBadge';

const LABEL = { ready: 'Ready', starting: 'Starting', degraded: 'Degraded', unavailable: 'Unavailable', stopped: 'Stopped' } as const;

/** Quick server toggles. Full tool lists live in Capabilities. */
export function McpPanel() {
  const { capabilities } = useServices();
  const servers = useObservable(capabilities).servers;
  return (
    <div className="panel stack">
      <div className="row gap"><h3>Servers</h3><SimBadge compact /></div>
      <ul className="stack gap-tight">
        {servers.map((s) => (
          <li key={s.id} className="row between wrap gap">
            <div className="stack gap-tight">
              <span>{s.name}</span>
              {s.reason ? <span className="small warn-text">{s.reason}</span> : null}
            </div>
            <div className="row gap">
              <StatusDot tone={mcpTone(s.state)} label={LABEL[s.state]} />
              <Toggle label={`Enable ${s.name}`} checked={s.enabled} onChange={(v) => capabilities.setServerEnabled(s.id, v)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
