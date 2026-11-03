import type { ChatMessage as ChatMessageT } from '../types/contracts';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { fmtTime } from '../app/presentation';
import { Badge } from './Badge';
import { Chip } from './Chip';
import { RouteFooter } from './RouteFooter';
import { TaskCard } from './TaskCard';
import { Icon } from './Icon';

/** One conversation message. Owner text is quiet; EDITH answers stream and show their route. */
export function ChatMessage({ message, ownerName }: { message: ChatMessageT; ownerName: string }) {
  const { tasks } = useServices();
  const allTasks = useObservable(tasks);

  if (message.kind === 'task' && message.taskId) {
    const task = allTasks.find((t) => t.id === message.taskId);
    return task ? <TaskCard task={task} /> : null;
  }

  if (message.kind === 'notice') {
    return (
      <div className="notice" role="note">
        <Icon name="alert" size={16} />
        <span>{message.text}</span>
      </div>
    );
  }

  if (message.role === 'owner') {
    return (
      <article className="msg msg-owner" aria-label={`${ownerName}: message`}>
        <header className="msg-head">
          <span className="label-caps">{ownerName}</span>
          <span className="faint small">{fmtTime(message.at)}</span>
          {message.source === 'voice' ? <Badge tone="accent">Voice</Badge> : null}
          {message.mode && message.mode !== 'auto' ? <Badge tone="muted">{en.composer.modes[message.mode]}</Badge> : null}
          {message.contextAttached ? <Badge tone="warn">{en.thread.context}</Badge> : null}
        </header>
        <p className="msg-text">{message.text}</p>
      </article>
    );
  }

  return (
    <article className="msg msg-edith" aria-label="EDITH: answer" aria-busy={message.streaming ? true : undefined}>
      <header className="msg-head">
        <span className="label-caps">{en.thread.edith}</span>
        <span className="faint small">{fmtTime(message.at)}</span>
        {message.linkedTaskId ? <Chip>{en.thread.linked}</Chip> : null}
      </header>
      <p className="msg-text">
        {message.text}
        {message.streaming ? <span className="cursor" aria-hidden="true" /> : null}
      </p>
      {message.route && !message.streaming ? <RouteFooter route={message.route} /> : null}
    </article>
  );
}
