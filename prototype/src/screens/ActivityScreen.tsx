import { useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { useRoute, navigate } from '../app/router';
import { HEALTH_LABEL, fmtDuration, fmtDateTime, healthTone, isActive, stateLabel, stateTone } from '../app/presentation';
import type { ProviderInfo, TaskRecord } from '../types/contracts';
import { Badge } from '../components/Badge';
import { StatusDot } from '../components/StatusDot';
import { SimBadge } from '../components/SimBadge';
import { Timeline } from '../components/Timeline';
import { DataTable, type Column } from '../components/DataTable';
import { EvidenceCard } from '../components/EvidenceCard';
import { ApprovalCard } from '../components/ApprovalCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { Icon } from '../components/Icon';

type Filter = 'all' | 'active' | 'waiting' | 'done' | 'blocked';

const FILTERS: Filter[] = ['all', 'active', 'waiting', 'done', 'blocked'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', active: 'Active', waiting: 'Waiting', done: 'Done', blocked: 'Blocked' };

function matchesFilter(t: TaskRecord, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'active') return isActive(t.state) && t.state !== 'Waiting';
  if (f === 'waiting') return t.state === 'Waiting';
  if (f === 'done') return t.state === 'Completed';
  return t.state === 'Failed' || t.state === 'Cancelled';
}

/** Activity centre: explains what EDITH is doing, in eight sections, without raw reasoning. */
export function ActivityScreen() {
  const { tasks, routing } = useServices();
  const all = useObservable(tasks);
  const providers = useObservable(routing).providers;
  const route = useRoute();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => all.filter((t) => matchesFilter(t, filter) && t.objective.toLowerCase().includes(query.toLowerCase())), [all, filter, query]);
  const selected = all.find((t) => t.id === route.section) ?? visible[0] ?? all[0];

  return (
    <div className="activity-layout">
      <section className="task-list-pane" aria-label="Tasks">
        <div className="stack">
          <TextField label={en.activity.search} type="search" value={query} onChange={setQuery} placeholder={en.activity.search} hideLabel />
          <SegmentedControl<Filter> label={en.activity.filter} value={filter} options={FILTERS.map((f) => ({ value: f, label: FILTER_LABEL[f] }))} onChange={setFilter} />
        </div>
        {visible.length === 0 ? <p className="empty">{en.activity.none}</p> : null}
        <ul className="task-list">
          {visible.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`task-list-item${selected?.id === t.id ? ' is-selected' : ''}`}
                aria-current={selected?.id === t.id ? 'true' : undefined}
                onClick={() => navigate(`/activity/${t.id}`)}
              >
                <StatusDot tone={stateTone(t.state)} label={stateLabel(t.state)} />
                <span className="task-list-title">{t.objective.length > 60 ? `${t.objective.slice(0, 60)}…` : t.objective}</span>
                <span className="faint small">{fmtDateTime(t.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="task-detail" aria-label="Task detail">
        {selected ? <TaskDetail task={selected} providers={providers} /> : <p className="empty">{en.activity.none}</p>}
      </section>
    </div>
  );
}

function TaskDetail({ task, providers }: { task: TaskRecord; providers: ProviderInfo[] }) {
  const { tasks } = useServices();
  const approvals = useObservable(tasks.approvals).filter((a) => a.taskId === task.id);
  const [within, setWithin] = useState('');
  const active = isActive(task.state);
  const provider = task.route ? providers.find((p) => p.id === task.route?.provider) : undefined;
  const events = task.events.filter((e) => e.text.toLowerCase().includes(within.toLowerCase()));
  const toolColumns: Column<TaskRecord['tools'][number]>[] = [
    { key: 'name', header: 'Tool', render: (r) => <code>{r.name}</code> },
    { key: 'args', header: 'Arguments (summary)', render: (r) => r.argsSummary },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'ok' ? 'ok' : r.status === 'error' ? 'error' : 'accent'}>{r.status}</Badge> },
    { key: 'dur', header: 'Duration', align: 'right', render: (r) => fmtDuration(r.durationMs) },
  ];
  const verdictColumns: Column<TaskRecord['verdicts'][number] & { id: string }>[] = [
    { key: 'c', header: 'Criterion', render: (r) => r.criterion },
    { key: 'v', header: 'Verdict', render: (r) => <Badge tone={r.verdict === 'pass' ? 'ok' : r.verdict === 'fail' ? 'error' : 'muted'}>{r.verdict}</Badge> },
    { key: 'e', header: 'Evidence', render: (r) => r.evidence ?? '—' },
  ];
  const verdictRows = task.verdicts.map((v, i) => ({ ...v, id: `v${i}` }));

  return (
    <article className="stack activity-stack">
      <header className="row between wrap gap">
        <div className="stack">
          <div className="row gap wrap">
            <StatusDot tone={stateTone(task.state)} label={stateLabel(task.state)} pulse={task.state === 'Executing'} />
            <Badge tone="muted">{task.intent}</Badge>
            <SimBadge compact />
          </div>
          <h2 className="activity-title">{task.objective}</h2>
        </div>
        {active ? (
          <button type="button" className="btn btn-danger" onClick={() => tasks.cancel(task.id)}>
            {en.composer.cancel}
          </button>
        ) : null}
      </header>

      <section aria-labelledby="s1" className="panel">
        <h3 id="s1">{en.activity.sections.objective}</h3>
        <p>
          <span className="faint">{en.task.objective}: </span>
          {task.objective}
        </p>
        <p className="small">
          <span className="faint">{en.task.verification}: </span>
          {task.verification.replace(/_/g, '-')} · <span className="faint">origin: </span>
          {task.origin}
        </p>
      </section>

      {approvals.length ? (
        <section aria-label="Approvals" className="stack">
          {approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="s2" className="panel">
        <h3 id="s2">{en.activity.sections.plan}</h3>
        <ol className="plan">
          {task.subtasks.map((s) => (
            <li key={s.id} className={`plan-step state-${s.state}${s.deps.length ? ' is-dependent' : ''}`}>
              <span className={`plan-state plan-${s.state}`} aria-label={`State: ${s.state}`}>
                {s.state === 'done' ? '✓' : s.state === 'running' ? '…' : s.state === 'skipped' ? '–' : s.state === 'failed' ? '!' : '○'}
              </span>
              <div className="stack gap-tight">
                <span>
                  {s.label}{' '}
                  <Badge tone={s.kind === 'model' ? 'violet' : 'blue'}>{s.kind === 'model' ? 'Model' : 'Tool'}</Badge>{' '}
                  <Badge tone="muted">{s.tier}</Badge>
                  {s.needsApproval ? <Badge tone="warn">Approval</Badge> : null}
                </span>
                <span className="small faint">
                  {s.capability}
                  {s.note ? ` · ${s.note}` : ''}
                  {s.attempts > 1 ? ` · attempt ${s.attempts}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="s3" className="panel">
        <h3 id="s3">{en.activity.sections.route}</h3>
        {task.route ? (
          <dl className="kv">
            <dt>{en.route.tier}</dt>
            <dd>{task.route.tier}</dd>
            <dt>Model</dt>
            <dd>{task.route.model ?? en.route.noModel}</dd>
            <dt>Provider</dt>
            <dd>
              {task.route.provider}{' '}
              {provider ? <Badge tone={healthTone(provider.health)}>{`${en.activity.health}: ${HEALTH_LABEL[provider.health]}`}</Badge> : null}
            </dd>
            <dt>{en.activity.dataClass}</dt>
            <dd>{task.route.dataClass}</dd>
            <dt>{en.activity.locality}</dt>
            <dd>{task.route.locality === 'Local' ? en.route.local : en.route.cloud}</dd>
            <dt>Executed by</dt>
            <dd>{task.route.executedBy === 'browser' ? en.route.ranInBrowser : en.route.noModelCalled}</dd>
            <dt>{en.task.orchestration}</dt>
            <dd>
              {task.orchestration.pattern} · {task.orchestration.steps} steps · up to {task.orchestration.maxParallel} in parallel · {task.orchestration.approvalGates} approval gate(s)
              <br />
              <span className="small faint">{task.orchestration.reason}</span>
            </dd>
          </dl>
        ) : (
          <p className="empty">No route recorded.</p>
        )}
      </section>

      <section aria-labelledby="s4" className="panel">
        <h3 id="s4">{en.activity.sections.tools}</h3>
        <DataTable caption="Tool invocations" columns={toolColumns} rows={task.tools} empty={en.activity.noTools} />
      </section>

      <section aria-labelledby="s5" className="panel">
        <div className="row between wrap gap">
          <h3 id="s5">{en.activity.sections.operations}</h3>
          <TextField label={en.activity.withinTask} type="search" value={within} onChange={setWithin} placeholder={en.activity.withinTask} hideLabel />
        </div>
        <Timeline events={events} />
      </section>

      <section aria-labelledby="s6" className="panel">
        <h3 id="s6">{en.activity.sections.errors}</h3>
        {task.errors.length === 0 ? (
          <p className="empty">{en.activity.noErrors}</p>
        ) : (
          <ul className="stack">
            {task.errors.map((e) => (
              <li key={e.id} className="error-item">
                <p className="error-text">{e.message}</p>
                <p className="small">
                  <span className="faint">Recovery: </span>
                  {e.recovery}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="s7" className="panel">
        <h3 id="s7">{en.activity.sections.verification}</h3>
        <DataTable caption="Verification criteria" columns={verdictColumns} rows={verdictRows} />
        {active ? <p className="small faint">Verification runs after the last step. Results appear here.</p> : null}
      </section>

      <section aria-labelledby="s8" className="panel">
        <h3 id="s8">{en.activity.sections.completion}</h3>
        {task.outcome ? (
          <p>
            <Badge tone={task.outcome === 'completed' ? 'ok' : task.outcome === 'failed' ? 'error' : 'muted'}>{task.outcome}</Badge>{' '}
            {task.blocker ? <span className="error-text">{task.blocker}</span> : null}
          </p>
        ) : (
          <p className="empty">Not finished yet.</p>
        )}
        {task.changedFiles.length ? (
          <div className="stack">
            <h4 className="label-caps">{en.task.changed}</h4>
            <ul className="changed-list">
              {task.changedFiles.map((f) => (
                <li key={f.path}>
                  <code>{f.path}</code> <span className="faint small">+{f.added} −{f.removed}</span>{' '}
                  <Badge tone={f.status === 'applied' ? 'ok' : f.status === 'denied' ? 'error' : 'warn'}>{f.status}</Badge>{' '}
                  <button type="button" className="btn btn-ghost btn-small" disabled title={en.activity.rollbackNote}>
                    <Icon name="refresh" size={12} />
                    {en.activity.rollback}
                  </button>
                </li>
              ))}
            </ul>
            <p className="small faint">{en.activity.rollbackNote}</p>
          </div>
        ) : null}
        {task.evidence.length ? <EvidenceCard sources={task.evidence} /> : null}
        {task.unresolved.length ? (
          <div className="stack">
            <h4 className="label-caps">{en.task.unresolved}</h4>
            <ul>
              {task.unresolved.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="small faint">
          {en.activity.link}: {en.activity.linkNote}
        </p>
      </section>
      <p className="small faint">
        {en.activity.sections.objective}: task id <code>{task.id}</code> · updated {fmtDateTime(task.updatedAt)}
      </p>
    </article>
  );
}

