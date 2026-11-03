import { useMemo, useState } from 'react';
import { en } from '../../i18n/en';
import { useObservable, useServices } from '../../app/services';
import { fmtDateTime } from '../../app/presentation';
import { Badge } from '../../components/Badge';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { SimBadge } from '../../components/SimBadge';
import type { LogEntry } from '../../types/contracts';

const ORDER: Record<LogEntry['level'], number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Log stream with filters and trace view. Export is a preview only: it shows what would be removed. */
export function LogsPanel() {
  const { diagnostics, settings } = useServices();
  const logs = useObservable(diagnostics);
  const sett = useObservable(settings);
  const [subsystem, setSubsystem] = useState('all');
  const [query, setQuery] = useState('');
  const [trace, setTrace] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const minLevel = String(sett.system.logLevel) as LogEntry['level'];
  const subsystems = Array.from(new Set(logs.map((l) => l.subsystem)));
  const rows = useMemo(
    () =>
      logs
        .filter((l) => ORDER[l.level] >= ORDER[minLevel])
        .filter((l) => subsystem === 'all' || l.subsystem === subsystem)
        .filter((l) => l.message.toLowerCase().includes(query.toLowerCase()))
        .slice(-80)
        .reverse(),
    [logs, minLevel, subsystem, query],
  );
  const traceRows = trace ? logs.filter((l) => l.traceId === trace) : [];

  return (
    <div className="stack">
      <section className="panel stack" aria-labelledby="stream-h">
        <div className="row gap wrap">
          <h3 id="stream-h">Log stream</h3>
          <SimBadge compact />
        </div>
        <div className="row gap wrap filters">
          <SelectField label={en.settings.logFilter} value={subsystem} onChange={setSubsystem} options={[['all', en.memory.all], ...subsystems.map((s) => [s, s] as [string, string])]} />
          <TextField label="Search logs" type="search" value={query} onChange={setQuery} placeholder="Search logs" />
          <span className="small faint">Minimum level from System settings: {minLevel}. Pause is in General settings.</span>
        </div>
        <div className="log-list" role="log" aria-label="Log entries" tabIndex={0}>
          {rows.map((l) => (
            <div key={l.id} className="log-row">
              <span className="mono faint">{fmtDateTime(l.at)}</span>
              <Badge tone={l.level === 'error' ? 'error' : l.level === 'warn' ? 'warn' : 'muted'}>{l.level}</Badge>
              <span className="small">{l.subsystem}</span>
              <span className="small">{l.message}</span>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setTrace(l.traceId)} aria-label={`Show trace ${l.traceId}`}>
                {l.traceId}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel stack" aria-labelledby="trace-h">
        <h3 id="trace-h">{en.settings.traces}</h3>
        {trace ? (
          <ol className="small stack gap-tight">
            {traceRows.map((l) => (
              <li key={l.id}>
                {l.subsystem}: {l.message}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">Select a trace ID in the log stream.</p>
        )}
      </section>

      <section className="panel stack" aria-labelledby="export-h">
        <h3 id="export-h">{en.settings.exportPreview}</h3>
        <p className="small faint">{en.settings.exportNote}</p>
        <button type="button" className="btn" onClick={() => setPreview(diagnostics.exportPreview())}>
          Show preview
        </button>
        {preview ? <pre className="code-block" aria-label="Export preview">{preview}</pre> : null}
      </section>
    </div>
  );
}
