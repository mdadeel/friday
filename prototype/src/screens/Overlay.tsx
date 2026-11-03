import { useState } from 'react';
import { useObservable, useServices } from '../app/services';
import { navigate } from '../app/router';
import { Badge } from '../components/ui';

type OverlayState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'attention' | 'offline';

const CAPTION: Record<OverlayState, string> = {
  idle: 'Ready',
  listening: 'Listening (simulated)',
  thinking: 'Working on a task (simulated)',
  speaking: 'Speaking (simulated)',
  attention: 'Needs your approval',
  offline: 'Daemon offline (simulated)',
};

const PREVIEWS: OverlayState[] = ['idle', 'listening', 'thinking', 'speaking', 'attention', 'offline'];

/**
 * Overlay surface. It shares services with the main app because it lives in the same tab.
 * The desktop overlay (layer surface, XWayland, or plain window) is not implemented in the prototype.
 */
export function OverlayScreen() {
  const s = useServices();
  const voice = useObservable(s.voice);
  const tasks = useObservable(s.tasks);
  const approvals = useObservable(s.tasks.approvals);
  const messages = useObservable(s.conversation);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<OverlayState | null>(null);
  const [draft, setDraft] = useState('');

  const derived: OverlayState = (() => {
    if (voice.state === 'Listening') return 'listening';
    if (voice.state === 'Speaking') return 'speaking';
    if (approvals.some((a) => a.status === 'pending')) return 'attention';
    if (tasks.some((t) => !['Completed', 'Failed', 'Cancelled'].includes(t.state))) return 'thinking';
    return 'idle';
  })();
  const state = preview ?? derived;
  const recent = messages.slice(-3);

  return (
    <div className="overlay-root" data-overlay-state={state}>
      <div className="overlay-card">
        <div className="overlay-top">
          <Badge tone="warn">Overlay (prototype)</Badge>
          <button type="button" className="btn ghost small" onClick={() => navigate('#/chat')}>
            Back to app
          </button>
        </div>

        <button
          type="button"
          className={`overlay-core state-${state}`}
          aria-expanded={expanded}
          aria-label={`EDITH ${CAPTION[state]}. Activate to ${expanded ? 'collapse' : 'expand'}.`}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="core-ring" aria-hidden="true" />
          <span className="core-label">E</span>
        </button>
        <p className="overlay-caption" aria-live="polite">{CAPTION[state]}</p>

        {expanded && (
          <div className="overlay-panel">
            <ul className="overlay-messages">
              {recent.length === 0 && <li className="muted small">No messages yet.</li>}
              {recent.map((m) => (
                <li key={m.id} className={m.role === 'owner' ? 'owner' : 'edith'}>
                  <span className="small muted">{m.role === 'owner' ? 'You' : 'EDITH'}</span>
                  <span>{m.text.length > 140 ? `${m.text.slice(0, 140)}…` : m.text || '…'}</span>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) s.conversation.send(draft);
                setDraft('');
              }}
            >
              <label htmlFor="overlay-input" className="sr-only">Message EDITH</label>
              <input id="overlay-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask EDITH (simulated)" />
              <button type="submit" className="btn primary small" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </div>
        )}

        <fieldset className="overlay-previews">
          <legend className="small muted">Preview states (simulated)</legend>
          {PREVIEWS.map((p) => (
            <button key={p} type="button" className={`chip ${state === p ? 'is-active' : ''}`} aria-pressed={state === p} onClick={() => setPreview(p === derived ? null : p)}>
              {p}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
