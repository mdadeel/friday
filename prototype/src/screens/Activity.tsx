import { useState } from 'react';
import { useObservable, useServices } from '../app/services';
import { ApprovalCard, TERMINAL_STATES, progressOf, stateTone } from '../components/TaskViews';
import { Badge, Empty, Panel, SimBadge, fmtDateTime, fmtTime } from '../components/ui';
import { verificationLabel } from '../services/mock/logic';

const STARTERS = [
  { label: 'Research an architecture question', text: 'Research the best architecture for our MCP host, and compare two alternatives.' },
  { label: 'Fix a bug in a repo', text: 'Fix the authentication bug in my repo' },
  { label: 'Continue yesterday', text: 'Continue what I was doing yesterday' },
];

export function ActivityScreen() {
  const s = useServices();
  const tasks = useObservable(s.tasks);
  const approvals = useObservable(s.tasks.approvals);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tasks.find((t) => t.id === (selectedId ?? tasks[0]?.id));

  return (
    <div className="activity">
      <div className="toolbar">
        <p className="muted small">Tasks run as simulations. Starting one goes through the conversation so routing and logs match real use.</p>
        <div className="row gap wrap">
          {STARTERS.map((st) => (
            <button key={st.label} type="button" className="btn ghost small" onClick={() => { s.conversation.send(st.text); window.location.hash = '#/chat'; }}>
              + {st.label}
            </button>
          ))}
        </div>
      </div>

      <div className="split">
        <Panel title="Tasks" className="list-panel">
          {tasks.length === 0 && <Empty>No tasks yet.</Empty>}
          <ul className="task-list" aria-label="Task list">
            {tasks.map((t) => {
              const { done, total } = progressOf(t);
              const isSel = selected?.id === t.id;
              return (
                <li key={t.id}>
                  <button type="button" className={`task-item ${isSel ? 'is-selected' : ''}`} aria-pressed={isSel} onClick={() => setSelectedId(t.id)}>
                    <span className="row between">
                      <Badge tone={stateTone(t.state)}>{t.state}</Badge>
                      <span className="small muted">{fmtTime(t.createdAt)}</span>
                    </span>
                    <span className="task-item-title">{t.objective}</span>
                    <span className="small muted">
                      {t.intent} · {done}/{total} steps
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="detail">
          {!selected ? (
            <Panel><Empty>Select a task, or start one above.</Empty></Panel>
          ) : (
            <>
              <Panel title={selected.objective} actions={<SimBadge />}>
                <div className="row gap wrap">
                  <Badge tone={stateTone(selected.state)}>{selected.state}</Badge>
                  <span className="small muted">Origin: {selected.origin} · started {fmtDateTime(selected.createdAt)}</span>
                  {!TERMINAL_STATES.includes(selected.state) && (
                    <button type="button" className="btn danger small" onClick={() => s.tasks.cancel(selected.id)}>
                      Cancel task
                    </button>
                  )}
                </div>
                {selected.blocker && <p className="warn-text small">Blocker: {selected.blocker}</p>}
              </Panel>

              {selected.route && (
                <Panel title="Route">
                  <dl className="kv small">
                    <dt>Tier</dt><dd>{selected.route.tier}</dd>
                    <dt>Provider and model</dt><dd>{selected.route.provider}{selected.route.model ? ` · ${selected.route.model}` : ' · none'}</dd>
                    <dt>Why</dt><dd>{selected.route.reason}</dd>
                    <dt>Data class</dt><dd>{selected.route.dataClass}</dd>
                    <dt>Fallbacks</dt><dd>{selected.route.fallbacks.join(', ') || 'none'}</dd>
                  </dl>
                </Panel>
              )}

              <Panel title="Plan">
                <ol className="plan">
                  {selected.subtasks.map((st, i) => (
                    <li key={st.id} className={`plan-step plan-${st.state}`}>
                      <span className="plan-index">{i + 1}</span>
                      <div className="plan-body">
                        <span className="plan-label">{st.label}</span>
                        <span className="small muted">
                          <code>{st.capability}</code> · {st.tier}
                          {st.deps.length > 0 && <> · after {st.deps.map((d) => selected.subtasks.findIndex((x) => x.id === d) + 1).join(', ')}</>}
                          {st.needsApproval && <> · needs approval</>}
                        </span>
                        {st.note && <span className="small muted">{st.note}</span>}
                      </div>
                      <Badge tone={st.state === 'done' ? 'ok' : st.state === 'running' ? 'accent' : st.state === 'skipped' ? 'muted' : 'muted'}>{st.state}</Badge>
                    </li>
                  ))}
                </ol>
              </Panel>

              <Panel title="Verification">
                <p className="small muted">Method: {verificationLabel(selected.verification)}</p>
                {selected.verdicts.length === 0 ? (
                  <Empty>No success criteria declared. The result is shown as unverified.</Empty>
                ) : (
                  <ul className="verdicts">
                    {selected.verdicts.map((v) => (
                      <li key={v.criterion}>
                        <Badge tone={v.verdict === 'pass' ? 'ok' : v.verdict === 'fail' ? 'error' : 'muted'}>{v.verdict}</Badge>
                        <span>{v.criterion}</span>
                        {v.evidence && <span className="small muted"> — {v.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {approvals.some((a) => a.taskId === selected.id && a.status === 'pending') && (
                <Panel title="Approvals">
                  {approvals
                    .filter((a) => a.taskId === selected.id && a.status === 'pending')
                    .map((a) => (
                      <ApprovalCard key={a.id} approval={a} />
                    ))}
                </Panel>
              )}

              <Panel title="Event log">
                <ol className="events small">
                  {selected.events.map((e) => (
                    <li key={e.id}>
                      <span className="muted mono">{fmtTime(e.at)}</span> <span className="mono">{e.kind}</span> — {e.text}
                    </li>
                  ))}
                </ol>
              </Panel>
            </>
          )}
        </div>
      </div>
      <p className="small muted">Pending approvals across all tasks: {approvals.filter((a) => a.status === 'pending').length}</p>
    </div>
  );
}
