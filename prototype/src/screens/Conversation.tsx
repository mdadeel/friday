import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, TaskRecord } from '../types/contracts';
import { useObservable, useServices } from '../app/services';
import { VoiceStrip } from '../components/VoiceStrip';
import { ApprovalCard, TaskCard, TERMINAL_STATES, stateTone, progressOf } from '../components/TaskViews';
import { Badge, Empty, Panel, SimBadge, fmtTime } from '../components/ui';
import { navigate } from '../app/router';

const QUICK_PROMPTS = [
  'What time is it?',
  'what is 12 * (3 + 4)',
  'Who am I?',
  'Research the best architecture for our MCP host, and compare two alternatives.',
  'Fix the authentication bug in my repo',
  'Continue what I was doing yesterday',
];

export function ConversationScreen() {
  const s = useServices();
  const messages = useObservable(s.conversation);
  const tasks = useObservable(s.tasks);
  const approvals = useObservable(s.tasks.approvals);
  const voice = useObservable(s.voice);
  const routing = useObservable(s.routing);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, last?.text]);

  const send = (text: string) => {
    if (!text.trim()) return;
    s.conversation.send(text);
    setDraft('');
  };

  const activeTask = tasks.find((t) => !TERMINAL_STATES.includes(t.state)) ?? tasks[0];
  const pending = approvals.filter((a) => a.status === 'pending');

  return (
    <div className="conv-layout">
      <section className="conv-main" aria-label="Conversation">
        <VoiceStrip voice={voice} />

        <div className="messages" role="log" aria-live="polite" aria-label="Messages">
          {messages.map((m) => (
            <MessageView key={m.id} message={m} tasks={tasks} />
          ))}
          <div ref={endRef} />
        </div>

        <div className="quick" aria-label="Example requests">
          {QUICK_PROMPTS.map((p) => (
            <button key={p} type="button" className="chip" onClick={() => send(p)}>
              {p}
            </button>
          ))}
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label htmlFor="composer" className="sr-only">
            Message EDITH
          </label>
          <textarea
            id="composer"
            rows={2}
            value={draft}
            placeholder="Type a request. Try a quick prompt above."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <button type="submit" className="btn primary" disabled={!draft.trim()}>
            Send
          </button>
        </form>
      </section>

      <aside className="now-panel" aria-label="Now">
        <Panel title="Now" actions={<SimBadge />}>
          {activeTask ? <ActiveSummary task={activeTask} /> : <Empty>No task yet. Ask for research or a code fix to see a plan here.</Empty>}
        </Panel>
        {pending.length > 0 && (
          <Panel title={`Waiting for you (${pending.length})`}>
            {pending.map((a) => (
              <ApprovalCard key={a.id} approval={a} objective={tasks.find((t) => t.id === a.taskId)?.objective} />
            ))}
          </Panel>
        )}
        <Panel title="Last route">
          {routing.recent[0] ? (
            <dl className="kv small">
              <dt>Tier</dt>
              <dd>{routing.recent[0].tier}</dd>
              <dt>Provider</dt>
              <dd>{routing.recent[0].provider}</dd>
              <dt>Model</dt>
              <dd>{routing.recent[0].model ?? 'none (no model call)'}</dd>
              <dt>Reason</dt>
              <dd>{routing.recent[0].reason}</dd>
            </dl>
          ) : (
            <Empty>No route yet.</Empty>
          )}
          <button type="button" className="btn ghost small" onClick={() => navigate('#/routing')}>
            Open Routing
          </button>
        </Panel>
        <div className="now-foot">
          <button type="button" className="btn ghost small" onClick={() => s.conversation.reset()}>
            New conversation
          </button>
        </div>
      </aside>
    </div>
  );
}

function MessageView({ message, tasks }: { message: ChatMessage; tasks: TaskRecord[] }) {
  if (message.kind === 'task' && message.taskId) {
    const task = tasks.find((t) => t.id === message.taskId);
    return task ? <div className="msg-row edith"><TaskCard task={task} /></div> : null;
  }
  if (message.kind === 'notice') {
    return (
      <div className="notice" role="note">
        <SimBadge label="Notice" />
        <p>{message.text}</p>
      </div>
    );
  }
  const mine = message.role === 'owner';
  return (
    <div className={`msg-row ${mine ? 'owner' : 'edith'}`}>
      <div className={`bubble ${mine ? 'bubble-owner' : 'bubble-edith'}`}>
        <div className="bubble-meta small muted">
          {mine ? 'You' : 'EDITH'} · {fmtTime(message.at)} · {message.source === 'voice' ? 'voice' : 'text'}
          {message.simulated && <> · simulated</>}
        </div>
        <p className="bubble-text">
          {message.text}
          {message.streaming && <span className="caret" aria-hidden="true">▍</span>}
        </p>
        {message.route && !message.streaming && (
          <div className="route-foot small">
            <Badge tone={message.route.tier === 'T0' ? 'ok' : 'info'}>{message.route.tier}</Badge>
            <span className="muted">
              {message.route.provider}
              {message.route.model ? ` · ${message.route.model}` : ' · no model call'} · {message.route.latencyMs} ms
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveSummary({ task }: { task: TaskRecord }) {
  const { done, total } = progressOf(task);
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div className="active-summary">
      <p className="small muted">{task.objective}</p>
      <div className="row gap">
        <Badge tone={stateTone(task.state)}>{task.state}</Badge>
        <span className="small muted">
          {done}/{total} steps
        </span>
      </div>
      <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Task progress">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <ol className="steps small">
        {task.subtasks.map((st) => (
          <li key={st.id} className={`step step-${st.state}`}>
            <span className="step-dot" aria-hidden="true" />
            {st.label}
            <span className="muted"> · {st.tier}</span>
          </li>
        ))}
      </ol>
      {task.blocker && <p className="small warn-text">Blocked: {task.blocker}</p>}
    </div>
  );
}
