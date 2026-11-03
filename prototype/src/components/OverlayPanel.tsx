import { useState } from 'react';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { isActive } from '../app/presentation';
import { navigate } from '../app/router';
import { Core, type CoreState } from './Core';
import { Icon } from './Icon';

/** Expanded overlay panel, 320 × 420 px: last three turns, a text input, cancel, and a way back to the main window. */
export function OverlayPanel({ core }: { core: CoreState }) {
  const { conversation, tasks } = useServices();
  const messages = useObservable(conversation).filter((m) => m.kind !== 'notice' && m.kind !== 'task');
  const last = messages.slice(-6);
  const running = useObservable(tasks).find((t) => isActive(t.state));
  const [text, setText] = useState('');
  return (
    <section className="overlay-panel" aria-label="EDITH quick panel">
      <header className="row between">
        <span className="brand small">EDITH</span>
        <Core state={core} size={36} />
      </header>
      <ol className="overlay-turns" aria-label="Last three turns">
        {last.length === 0 ? <li className="faint small">No turns yet.</li> : null}
        {last.map((m) => (
          <li key={m.id} className={m.role === 'owner' ? 'turn-owner' : 'turn-edith'}>
            <span className="label-caps">{m.role === 'owner' ? 'You' : 'EDITH'}</span>
            <span className="small">{m.text.length > 140 ? `${m.text.slice(0, 140)}…` : m.text}</span>
          </li>
        ))}
      </ol>
      <form
        className="row gap"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) conversation.send(text, 'text');
          setText('');
        }}
      >
        <label className="sr-only" htmlFor="overlay-input">
          {en.composer.label}
        </label>
        <input id="overlay-input" className="control" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask EDITH" />
        <button type="submit" className="btn btn-icon btn-primary" aria-label={en.composer.send}>
          <Icon name="send" size={14} />
        </button>
      </form>
      <div className="row between">
        <button type="button" className="btn btn-danger" disabled={!running} onClick={() => running && tasks.cancel(running.id)}>
          {en.composer.cancel}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/chat')}>
          {en.overlay.openMain}
        </button>
      </div>
    </section>
  );
}
