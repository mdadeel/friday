import { useState } from 'react';
import type { McpServer } from '../types/contracts';
import { en } from '../i18n/en';
import { useServices } from '../app/services';
import { AUTONOMY_LABEL, mcpTone, fmtDateTime, fmtDuration } from '../app/presentation';
import { StatusDot } from './StatusDot';
import { Badge } from './Badge';
import { Toggle } from './Toggle';
import { SimBadge } from './SimBadge';
import { CapabilityBadge } from './CapabilityBadge';
import { DataTable, type Column } from './DataTable';

const STATE_LABEL: Record<McpServer['state'], string> = { ready: 'Ready', starting: 'Starting', degraded: 'Degraded', unavailable: 'Unavailable', stopped: 'Stopped' };

/** MCP server card. Expanded view lists tools with side-effect class and autonomy, plus the last 20 calls. */
export function McpServerCard({ server }: { server: McpServer }) {
  const { capabilities } = useServices();
  const [open, setOpen] = useState(false);
  const last = server.history[0];
  const historyColumns: Column<McpServer['history'][number]>[] = [
    { key: 't', header: 'Time', render: (r) => <span className="mono small">{fmtDateTime(r.at)}</span> },
    { key: 'c', header: 'Call', render: (r) => r.summary },
    { key: 's', header: 'Status', render: (r) => <Badge tone={r.status === 'ok' ? 'ok' : r.status === 'timeout' ? 'warn' : 'error'}>{r.status}</Badge> },
    { key: 'd', header: 'Duration', align: 'right', render: (r) => fmtDuration(r.durationMs) },
  ];

  return (
    <section className="card card-mcp" aria-labelledby={`mcp-${server.id}`}>
      <header className="card-head">
        <h3 id={`mcp-${server.id}`}>{server.name}</h3>
        <CapabilityBadge kind="mcp_tool" />
        <Badge tone="muted">{server.transport === 'stdio' ? 'stdio' : 'Streamable HTTP'}</Badge>
        <SimBadge compact />
        <span className="spacer" />
        <Toggle label={`Enable ${server.name}`} checked={server.enabled} onChange={(v) => capabilities.setServerEnabled(server.id, v)} />
      </header>
      <div className="row gap wrap">
        <StatusDot tone={mcpTone(server.state)} label={STATE_LABEL[server.state]} pulse={server.state === 'starting'} />
        {server.reason ? <span className="small warn-text">{server.reason}</span> : null}
      </div>
      <p className="small faint">
        {server.tools.length} tools · {server.source} · last call: {last ? `${last.status}, ${fmtDuration(last.durationMs)}` : 'none'}
      </p>
      <div className="row gap wrap">
        <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'Show tools and history'}
        </button>
        {server.enabled ? (
          <button type="button" className="btn btn-ghost" onClick={() => capabilities.restart(server.id)}>
            {en.capabilities.restart}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="card-details stack">
          <h4 className="label-caps">{en.capabilities.tools}</h4>
          <ul className="tool-list">
            {server.tools.map((t) => (
              <li key={t.name} className="tool-row">
                <div className="stack gap-tight">
                  <code>{t.name}</code>
                  <span className="small">{t.description}</span>
                  <span className="row gap wrap">
                    <Badge tone="muted">{`side effect: ${t.sideEffect}`}</Badge>
                    <Badge tone={t.autonomy === 'blocked' ? 'error' : t.autonomy === 'confirm_required' ? 'warn' : 'ok'}>{AUTONOMY_LABEL[t.autonomy]}</Badge>
                  </span>
                </div>
                <Toggle label={`Enable tool ${t.name}`} checked={t.enabled} onChange={(v) => capabilities.setToolEnabled(server.id, t.name, v)} disabled={server.state !== 'ready'} />
              </li>
            ))}
          </ul>
          <p className="small">
            <span className="faint">{en.capabilities.resources}: </span>
            {server.resources.length ? server.resources.join(', ') : 'none'} ·<span className="faint"> {en.capabilities.prompts}: </span>
            {server.prompts.length ? server.prompts.join(', ') : 'none'}
          </p>
          <h4 className="label-caps">{en.capabilities.history}</h4>
          <DataTable caption={`Recent calls for ${server.name}`} columns={historyColumns} rows={server.history.slice(0, 20)} empty="No calls yet." />
        </div>
      ) : null}
    </section>
  );
}
