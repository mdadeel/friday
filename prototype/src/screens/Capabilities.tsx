import { useState } from 'react';
import type { McpServer, Skill } from '../types/contracts';
import { useObservable, useServices } from '../app/services';
import { Badge, Empty, Panel, SimBadge, Toggle, fmtTime } from '../components/ui';

const STATE_TONE: Record<McpServer['state'], 'ok' | 'warn' | 'error' | 'info' | 'muted'> = {
  ready: 'ok',
  starting: 'info',
  degraded: 'warn',
  unavailable: 'error',
  stopped: 'muted',
};

export function CapabilitiesScreen() {
  const [tab, setTab] = useState<'mcp' | 'skills'>('mcp');
  return (
    <div className="capabilities">
      <div className="tabs" role="tablist" aria-label="Capability type">
        {(['mcp', 'skills'] as const).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>
            {t === 'mcp' ? 'MCP servers' : 'Skills'}
          </button>
        ))}
      </div>
      <p className="small muted">
        Capability kinds: <Badge>instruction</Badge> guides the model and enforces nothing · <Badge>native tool</Badge> built-in, typed · <Badge>MCP tool</Badge> external server · <Badge>external service</Badge> model or search provider.
        Every tool call passes the policy engine; toggles here only control availability.
      </p>
      {tab === 'mcp' ? <McpList /> : <SkillList />}
    </div>
  );
}

function McpList() {
  const s = useServices();
  const { servers } = useObservable(s.capabilities);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="stack">
      {servers.map((srv) => {
        const open = openId === srv.id;
        return (
          <Panel
            key={srv.id}
            title={
              <span className="row gap">
                {srv.name} <Badge tone={STATE_TONE[srv.state]}>{srv.state}</Badge>
              </span>
            }
            actions={<SimBadge />}
          >
            <dl className="kv small">
              <dt>Transport</dt><dd><code>{srv.transport}</code></dd>
              <dt>Endpoint</dt><dd className="mono">{srv.endpoint}</dd>
              <dt>Source</dt><dd>{srv.source}</dd>
            </dl>
            {srv.reason && <p className="small warn-text">{srv.reason}</p>}
            <div className="row gap wrap between">
              <Toggle checked={srv.enabled} label={srv.enabled ? 'Enabled' : 'Disabled'} onChange={(v) => s.capabilities.setServerEnabled(srv.id, v)} />
              <div className="row gap">
                <button type="button" className="btn ghost small" onClick={() => s.capabilities.restart(srv.id)} disabled={!srv.enabled}>Restart</button>
                <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpenId(open ? null : srv.id)}>
                  {open ? 'Hide tools' : `Tools (${srv.tools.length})`}
                </button>
              </div>
            </div>
            {open && (
              <>
                <table className="table">
                  <thead><tr><th>Tool</th><th>Side effect</th><th>Autonomy</th><th>Enabled</th></tr></thead>
                  <tbody>
                    {srv.tools.map((t) => (
                      <tr key={t.name}>
                        <td><code>{t.name}</code><div className="small muted">{t.description}</div></td>
                        <td>{t.sideEffect}</td>
                        <td><Badge tone={t.autonomy === 'automatic' ? 'ok' : t.autonomy === 'blocked' ? 'error' : 'warn'}>{t.autonomy.replace('_', ' ')}</Badge></td>
                        <td>
                          <Toggle checked={t.enabled} label={t.enabled ? 'on' : 'off'} onChange={(v) => s.capabilities.setToolEnabled(srv.id, t.name, v)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3 className="small">Recent calls</h3>
                {srv.history.length === 0 ? (
                  <Empty>No calls yet.</Empty>
                ) : (
                  <ul className="events small">
                    {srv.history.map((h) => (
                      <li key={h.id}>
                        <span className="muted mono">{fmtTime(h.at)}</span> <code>{h.capability}</code> · {h.durationMs} ms · <Badge tone={h.status === 'ok' ? 'ok' : 'error'}>{h.status}</Badge> {h.summary}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

function SkillList() {
  const s = useServices();
  const { skills } = useObservable(s.capabilities);
  return (
    <div className="stack">
      <p className="small muted">Skills are SKILL.md-style instruction packs. A skill whose content hash changed must be re-approved before use.</p>
      {skills.map((k: Skill) => (
        <Panel key={k.id} title={<span className="row gap">{k.name} <span className="small muted">v{k.version}</span></span>} actions={<SimBadge />}>
          <p className="small">{k.description}</p>
          <dl className="kv small">
            <dt>Kind</dt><dd>{k.kind}</dd>
            <dt>Adapter</dt><dd>{k.adapter}</dd>
            <dt>Requires</dt><dd>{k.requires.length ? k.requires.map((r) => <code key={r} className="mr">{r}</code>) : 'nothing beyond instructions'}</dd>
            <dt>Compatibility</dt><dd>{k.compatibility}</dd>
            <dt>Content hash</dt><dd>{k.hashStatus === 'approved' ? <Badge tone="ok">approved</Badge> : <Badge tone="warn">changed — re-approve</Badge>}</dd>
          </dl>
          <div className="row gap wrap">
            <Toggle checked={k.enabled} label={k.enabled ? 'Enabled' : 'Disabled'} onChange={(v) => s.capabilities.setSkillEnabled(k.id, v)} />
            {k.hashStatus === 'changed' && (
              <button type="button" className="btn primary small" onClick={() => s.capabilities.approveSkillChange(k.id)}>Approve new version</button>
            )}
          </div>
        </Panel>
      ))}
      {skills.length === 0 && <Empty>No skills installed.</Empty>}
    </div>
  );
}
