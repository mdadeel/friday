import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { useCoreState } from '../app/useCoreState';
import { ChatMessage } from '../components/ChatMessage';
import { Composer } from '../components/Composer';
import { NowPanel } from '../components/NowPanel';
import { Core } from '../components/Core';
import { Icon } from '../components/Icon';

const PROMPTS = en.composer.prompts;

/** The conversation is the default focus. Route footers, task cards and approvals appear inline. */
export function ConversationScreen() {
  const { conversation, settings, voice } = useServices();
  const messages = useObservable(conversation);
  const sett = useObservable(settings);
  const v = useObservable(voice);
  const core = useCoreState();
  const owner = String(sett.general.ownerName);
  const hero = messages.length <= 1;

  return (
    <div className="conv-layout">
      <section className="conv" aria-label="Conversation">
        <div className="thread" role="log" aria-live="polite" aria-relevant="additions">
          {hero ? (
            <div className="hero">
              <Core state={core} size={148} level={v.level} />
              <h2 className="hero-title">{en.thread.heading}</h2>
              <p className="hero-intro">{en.thread.intro}</p>
              <ul className="prompt-tiles" aria-label="Suggested requests">
                {PROMPTS.map((p) => (
                  <li key={p.text}>
                    <button type="button" className="prompt-tile" onClick={() => conversation.send(p.text, 'text', { mode: 'auto' })}>
                      <span>{p.label}</span>
                      <span className="faint small">{p.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} ownerName={owner} />
          ))}
        </div>
        {v.state === 'Speaking' ? (
          <div className="speaking-bar" role="status">
            <Icon name="wave" size={16} />
            <span>{en.voice.Speaking}</span>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost" onClick={() => voice.bargeIn()}>
              <Icon name="stop" size={12} />
              <span>Stop</span>
            </button>
          </div>
        ) : null}
        <Composer />
      </section>
      <NowPanel />
    </div>
  );
}
