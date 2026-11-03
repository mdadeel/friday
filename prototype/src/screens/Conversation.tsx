import { useEffect, useRef } from 'react';
import type { ChatMessage, TaskRecord } from '../types/contracts';
import { useObservable, useServices } from '../app/services';
import { VoiceStrip } from '../components/VoiceStrip';
import { ApprovalCard, TaskCard, TERMINAL_STATES, stateTone, progressOf } from '../components/TaskViews';
import { Badge, Empty, Panel, SimBadge } from '../components/ui';
import { navigate } from '../app/router';
import { MessageItem, PromptInput } from '../components/ai';

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
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, last?.text]);

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

        <PromptInput
          onSend={(text, source) => s.conversation.send(text, source)}
          quickPrompts={QUICK_PROMPTS}
        />
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
  return <MessageItem message={message} />;
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
