import { useObservable, useServices } from '../../app/services';
import { AUTONOMY_LABEL } from '../../app/presentation';
import { Badge } from '../../components/Badge';
import { Toggle } from '../../components/Toggle';
import { SimBadge } from '../../components/SimBadge';

/** Per-tool toggles for MCP tools. Hints from other tools are shown as hints, never as allow rules. */
export function ToolPermissionsPanel() {
  const { capabilities } = useServices();
  const servers = useObservable(capabilities).servers;
  return (
    <div className="stack">
      {servers.map((s) => (
        <div key={s.id} className="panel stack">
          <div className="row gap"><h3>{s.name}</h3><SimBadge compact /></div>
          <ul className="stack gap-tight">
            {s.tools.map((t) => (
              <li key={t.name} className="row between wrap gap">
                <span>
                  <code>{t.name}</code> <Badge tone={t.autonomy === 'blocked' ? 'error' : t.autonomy === 'confirm_required' ? 'warn' : 'ok'}>{AUTONOMY_LABEL[t.autonomy]}</Badge>
                </span>
                <Toggle label={`Enable tool ${t.name}`} checked={t.enabled} onChange={(v) => capabilities.setToolEnabled(s.id, t.name, v)} disabled={!s.enabled} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="panel stack">
        <h3>External hints</h3>
        <p className="small faint">
          Hints imported from OpenCode or Claude Code configuration are shown as external hints, not enforced as allow rules. None are imported in this prototype.
        </p>
      </div>
    </div>
  );
}
