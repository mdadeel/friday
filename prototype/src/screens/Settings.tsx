import { useMemo, useState, type ReactNode } from 'react';
import { navigate } from '../app/router';
import { useObservable, useServices } from '../app/services';
import { SECTIONS, type FieldDef, type SectionDef } from '../data/settingsSchema';
import type { AutonomyClass, PolicyLimits, PolicyRule } from '../types/contracts';
import { Badge, Empty, Panel, SimBadge, Toggle, fmtTime } from '../components/ui';
import { ProvidersTable } from './ProvidersTable';
import { DEFAULT_LIMITS } from '../services/mock/policy';
import type { SettingValue } from '../services/contracts';

export function SettingsScreen({ section }: { section?: string }) {
  const current = SECTIONS.find((x) => x.id === section) ?? SECTIONS[0];
  const [q, setQ] = useState('');
  const shown = useMemo(() => SECTIONS.filter((x) => !q.trim() || x.title.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  const s = useServices();

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        <label className="sr-only" htmlFor="settings-filter">Filter settings</label>
        <input id="settings-filter" type="search" placeholder="Filter sections" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul>
          {shown.map((x) => (
            <li key={x.id}>
              <a href={`#/settings/${x.id}`} className={`settings-link ${x.id === current.id ? 'is-current' : ''}`} aria-current={x.id === current.id ? 'page' : undefined}>
                {x.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="settings-main">
        <header className="section-head">
          <h2>{current.title}</h2>
          <p className="muted">{current.purpose}</p>
          <p className="small">
            <Badge tone="warn">Not persisted</Badge>{' '}
            <span className="muted">Changes last for this browser session. No daemon reads them.</span>
          </p>
        </header>

        {current.fields.length > 0 && (
          <Panel>
            <FieldList section={current} />
          </Panel>
        )}

        {current.panel && <SectionPanel panel={current.panel} />}

        {current.id === 'general' && (
          <div className="row gap">
            <button type="button" className="btn ghost small" onClick={() => s.settings.reset()}>Reset all settings to defaults</button>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldList({ section }: { section: SectionDef }) {
  const s = useServices();
  const values = useObservable(s.settings);
  const sectionValues = values[section.id] ?? {};
  return (
    <div className="fields">
      {section.fields.map((f) => (
        <FieldRow
          key={f.key}
          field={f}
          value={sectionValues[f.key] ?? f.def}
          onChange={(v) => s.settings.set(section.id, f.key, v)}
        />
      ))}
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: FieldDef; value: SettingValue; onChange: (v: SettingValue) => void }) {
  const id = `f-${field.key}`;
  let control: ReactNode;
  switch (field.kind) {
    case 'toggle':
      control = <Toggle checked={Boolean(value)} label={value ? 'On' : 'Off'} onChange={onChange} />;
      break;
    case 'select':
      control = (
        <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {field.options.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      );
      break;
    case 'number':
      control = (
        <span className="row gap">
          <input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) onChange(Math.min(field.max, Math.max(field.min, n)));
            }}
          />
          {field.unit && <span className="muted small">{field.unit}</span>}
        </span>
      );
      break;
    case 'text':
      control = <input id={id} type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
      break;
  }
  return (
    <div className="field">
      <div className="field-label">
        {field.kind === 'toggle' ? <span>{field.label}</span> : <label htmlFor={id}>{field.label}</label>}
        {field.help && <p className="small muted">{field.help}</p>}
      </div>
      <div className="field-control">{control}</div>
    </div>
  );
}

function SectionPanel({ panel }: { panel: NonNullable<SectionDef['panel']> }) {
  switch (panel) {
    case 'providers':
      return (
        <Panel title="Providers and consent" actions={<SimBadge />}>
          <ProvidersTable />
        </Panel>
      );
    case 'local-models': {
      return <LocalModels />;
    }
    case 'routing':
      return (
        <Panel title="Tier routes">
          <p className="small">The tier table, probes and route tests live on the Routing screen.</p>
          <button type="button" className="btn ghost small" onClick={() => navigate('#/routing')}>Open Routing</button>
        </Panel>
      );
    case 'mcp':
      return <McpSummary />;
    case 'skills':
      return <SkillsSummary />;
    case 'search':
      return <SearchPanel />;
    case 'autonomy':
      return <AutonomyPanel />;
    case 'tool-permissions':
      return <ToolPermissions />;
    case 'system':
      return <SystemPanel />;
    case 'logs':
      return <LogsPanel />;
  }
}

function LocalModels() {
  const s = useServices();
  const routing = useObservable(s.routing);
  const local = routing.providers.filter((p) => p.kind === 'local_server');
  return (
    <Panel title="Local model servers" actions={<SimBadge />}>
      {local.map((p) => (
        <div key={p.id} className="stack-sm">
          <strong>{p.name}</strong>
          <ul className="plain small">
            {p.models.map((m) => (
              <li key={m}>
                {m} <Badge tone="muted">not benchmarked (G1)</Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="small muted">Model sizes are candidates. The prototype never loads a model.</p>
    </Panel>
  );
}

function McpSummary() {
  const s = useServices();
  const { servers } = useObservable(s.capabilities);
  return (
    <Panel title="Servers">
      <ul className="plain small">
        {servers.map((x) => (
          <li key={x.id}>
            <strong>{x.name}</strong> <Badge tone={x.state === 'ready' ? 'ok' : x.state === 'unavailable' ? 'error' : 'muted'}>{x.state}</Badge>
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost small" onClick={() => navigate('#/capabilities')}>Manage in Capabilities</button>
    </Panel>
  );
}

function SkillsSummary() {
  const s = useServices();
  const { skills } = useObservable(s.capabilities);
  return (
    <Panel title="Installed skills">
      <ul className="plain small">
        {skills.map((k) => (
          <li key={k.id}>
            <strong>{k.name}</strong> v{k.version} · {k.enabled ? 'enabled' : 'disabled'}
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost small" onClick={() => navigate('#/capabilities')}>Manage in Capabilities</button>
    </Panel>
  );
}

function SearchPanel() {
  const s = useServices();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<import('../types/contracts').SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await s.search.query(q);
    setResults(r);
    setBusy(false);
  };
  return (
    <Panel title="Search test" actions={<SimBadge label="Simulated bank" />}>
      <p className="small muted">Results come from a fixed reference list, not from the web. Use this to check the result layout only.</p>
      <form className="row gap wrap" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <label htmlFor="search-q" className="sr-only">Search query</label>
        <input id="search-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. MCP transports" />
        <button type="submit" className="btn primary small" disabled={busy}>{busy ? 'Searching…' : 'Search (simulated)'}</button>
      </form>
      {results && results.length === 0 && <Empty>No simulated matches.</Empty>}
      {results && results.length > 0 && (
        <ol className="results">
          {results.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
              <div className="small muted mono">{r.url}</div>
              <div className="small">{r.snippet}</div>
              <div className="small muted">{r.provider} · authority tier {r.authorityTier} · <SimBadge /></div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const AUTONOMY_OPTIONS: AutonomyClass[] = ['automatic', 'policy_controlled', 'confirm_required', 'blocked'];
const SCOPES: { key: PolicyRule['scope']; label: string }[] = [
  { key: 'inside_project', label: 'Inside project' },
  { key: 'inside_home', label: 'Inside home' },
  { key: 'elsewhere', label: 'Elsewhere' },
];
const LIMIT_FIELDS: { key: keyof PolicyLimits; label: string; unit: string; min: number; max: number }[] = [
  { key: 'filesPerTask', label: 'Files changed per task', unit: 'files', min: 1, max: 50 },
  { key: 'writtenMB', label: 'Data written per task', unit: 'MB', min: 1, max: 100 },
  { key: 'processRuns', label: 'Process runs per task', unit: 'runs', min: 1, max: 200 },
  { key: 'fetches', label: 'Network fetches per task', unit: 'fetches', min: 1, max: 200 },
  { key: 'budgetMinutes', label: 'Wall-clock budget per task', unit: 'min', min: 1, max: 240 },
];

function AutonomyPanel() {
  const s = useServices();
  const policy = useObservable(s.policy);
  const groups = Array.from(new Set(policy.rules.map((r) => r.group)));
  return (
    <>
      <Panel title="Confirmation rules" actions={<SimBadge label="Editable, not enforced" />}>
        <p className="small muted">
          Locked cells are fixed by policy in v1. Other cells can be edited here, but the prototype does not enforce them.
          Confirmation prompts always show the exact files, hosts or commands affected.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Action</th>{SCOPES.map((sc) => <th key={sc.key}>{sc.label}</th>)}</tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g}>
                  <th scope="row">{g}</th>
                  {SCOPES.map((sc) => {
                    const rule = policy.rules.find((r) => r.group === g && r.scope === sc.key);
                    if (!rule) return <td key={sc.key}>—</td>;
                    return (
                      <td key={sc.key}>
                        <label className="sr-only" htmlFor={`rule-${rule.id}`}>{g}, {sc.label}</label>
                        <select id={`rule-${rule.id}`} value={rule.autonomy} disabled={rule.locked} title={rule.explanation} onChange={(e) => s.policy.setAutonomy(rule.id, e.target.value as AutonomyClass)}>
                          {AUTONOMY_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                        </select>
                        {rule.locked && <span className="small muted"> 🔒</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Per-task limits" actions={<SimBadge label="Editable, not enforced" />}>
        <div className="fields">
          {LIMIT_FIELDS.map((f) => (
            <div key={f.key} className="field">
              <div className="field-label"><label htmlFor={`lim-${f.key}`}>{f.label}</label><p className="small muted">Default {DEFAULT_LIMITS[f.key]} {f.unit}</p></div>
              <div className="field-control row gap">
                <input id={`lim-${f.key}`} type="number" min={f.min} max={f.max} value={policy.limits[f.key]} onChange={(e) => s.policy.setLimit(f.key, Number(e.target.value))} />
                <span className="small muted">{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Audit trail (simulated)">
        {policy.audit.length === 0 ? <Empty>No entries.</Empty> : (
          <ul className="events small">
            {policy.audit.slice(0, 12).map((a) => (
              <li key={a.id}><span className="muted mono">{fmtTime(a.at)}</span> <span className="mono">{a.kind}</span> — {a.summary}{a.decision && <> · <em>{a.decision}</em></>}</li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

const NATIVE_TOOLS: { name: string; desc: string; autonomy: AutonomyClass }[] = [
  { name: 'time.now / date.today', desc: 'Clock in the owner time zone (Tier 0)', autonomy: 'automatic' },
  { name: 'calc.eval', desc: 'Safe arithmetic, no eval (Tier 0)', autonomy: 'automatic' },
  { name: 'fs.read', desc: 'Read files inside the project root', autonomy: 'automatic' },
  { name: 'fs.write', desc: 'Write files inside the project root, with preview', autonomy: 'policy_controlled' },
  { name: 'process.run_template', desc: 'Typed command templates (git, cargo, npm test); no shell', autonomy: 'policy_controlled' },
  { name: 'git.status', desc: 'Read-only repository status', autonomy: 'automatic' },
  { name: 'search.web', desc: 'Search through a configured provider', autonomy: 'automatic' },
  { name: 'fetch.url', desc: 'Fetch a page, with robots and size limits', autonomy: 'policy_controlled' },
  { name: 'memory.search', desc: 'Search stored memory', autonomy: 'automatic' },
  { name: 'memory.propose', desc: 'Propose a memory for review; never writes silently', autonomy: 'confirm_required' },
];

function ToolPermissions() {
  return (
    <Panel title="Native tools" actions={<SimBadge label="Read-only in prototype" />}>
      <table className="table small">
        <thead><tr><th>Tool</th><th>What it does</th><th>Class</th></tr></thead>
        <tbody>
          {NATIVE_TOOLS.map((t) => (
            <tr key={t.name}>
              <td><code>{t.name}</code></td>
              <td>{t.desc}</td>
              <td><Badge tone={t.autonomy === 'automatic' ? 'ok' : 'warn'}>{t.autonomy.replace(/_/g, ' ')}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Tool names are design names from the specification. No tool is executed by the prototype.</p>
    </Panel>
  );
}

function SystemPanel() {
  return (
    <Panel title="Platform facts" actions={<SimBadge />}>
      <dl className="kv small">
        <dt>Prototype version</dt><dd>0.1.0 (web, simulated)</dd>
        <dt>Daemon</dt><dd>Not running. The real daemon is planned as <code>edith-daemon</code>.</dd>
        <dt>Local API</dt><dd>Planned: HTTP/JSON over a Unix socket at <code>$XDG_RUNTIME_DIR/edith/api.sock</code> (mode 0600), routes under <code>/v1</code>. Not running here.</dd>
        <dt>Overlay mode in use</dt><dd>Plain window (prototype web page; no desktop overlay)</dd>
        <dt>Storage used</dt><dd>0 MB (nothing is stored outside this browser tab)</dd>
      </dl>
      <div className="row gap">
        <button type="button" className="btn ghost small" disabled>Restart daemon</button>
        <span className="small muted">Unavailable: no daemon in the prototype.</span>
      </div>
    </Panel>
  );
}

function LogsPanel() {
  const s = useServices();
  const logs = useObservable(s.diagnostics);
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all');
  const [exported, setExported] = useState<string | null>(null);
  const rows = logs.filter((l) => level === 'all' || (level === 'warn' ? l.level !== 'debug' && l.level !== 'info' : l.level === 'error'));
  return (
    <Panel title="Logs" actions={<SimBadge />}>
      <div className="row gap wrap">
        <label htmlFor="log-level" className="small muted">Show</label>
        <select id="log-level" value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
          <option value="all">All levels</option>
          <option value="warn">Warnings and errors</option>
          <option value="error">Errors only</option>
        </select>
        <button type="button" className="btn ghost small" onClick={() => setExported(s.diagnostics.exportPreview())}>Show export preview</button>
      </div>
      <ul className="events small">
        {rows.slice(-60).reverse().map((l) => (
          <li key={l.id}>
            <Badge tone={l.level === 'error' ? 'error' : l.level === 'warn' ? 'warn' : 'muted'}>{l.level}</Badge>{' '}
            <span className="muted mono">{fmtTime(l.at)}</span> <span className="mono">{l.subsystem}</span> {l.message} <span className="muted mono">{l.traceId}</span>
          </li>
        ))}
      </ul>
      {exported && <pre className="export">{exported}</pre>}
    </Panel>
  );
}
