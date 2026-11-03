import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ChatMode } from '../types/contracts';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { isActive } from '../app/presentation';
import { Icon } from './Icon';
import { SegmentedControl } from './SegmentedControl';
import { CaptionStrip } from './CaptionStrip';
import { Chip } from './Chip';

const FOLLOW_UP = /\b(continue that|that task|the last task|continue this)\b/i;

/** Input. Enter sends, Shift+Enter adds a line. Voice has hold or toggle mode. Cancel is live while a task runs. */
export function Composer() {
  const { conversation, tasks, voice, settings } = useServices();
  const v = useObservable(voice);
  const allTasks = useObservable(tasks);
  const sett = useObservable(settings);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ChatMode>('auto');
  const [attach, setAttach] = useState(false);

  const running = allTasks.find((t) => isActive(t.state));
  const listenMode = String(sett.voice.listenMode);
  const listening = v.state === 'Listening';
  const linked = FOLLOW_UP.test(text) ? allTasks[0] : undefined;

  const submit = () => {
    if (!text.trim()) return;
    conversation.send(text, 'text', { mode, attachContext: attach });
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const voiceProps =
    listenMode === 'push'
      ? {
          onPointerDown: (e: PointerEvent) => {
            if (e.button === 0) voice.pressToTalk();
          },
          onPointerUp: () => voice.release(),
          onPointerLeave: () => listening && voice.release(),
          onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault();
              voice.pressToTalk();
            }
          },
          onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
            if (e.key === ' ' || e.key === 'Enter') voice.release();
          },
        }
      : {
          onClick: () => (listening ? voice.release() : voice.pressToTalk()),
        };

  return (
    <div className="composer-wrap">
      <CaptionStrip voice={v} />
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="composer-input">
          {en.composer.label}
        </label>
        <textarea
          id="composer-input"
          className="composer-input"
          rows={2}
          value={text}
          placeholder={en.composer.placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="composer-bar">
          <SegmentedControl
            label={en.composer.modeLabel}
            value={mode}
            options={(['auto', 'research', 'code'] as ChatMode[]).map((m) => ({ value: m, label: en.composer.modes[m] }))}
            onChange={setMode}
          />
          <button
            type="button"
            className={`btn btn-toggle${attach ? ' is-on' : ''}`}
            aria-pressed={attach}
            title={en.composer.attachHint}
            onClick={() => setAttach((a) => !a)}
          >
            <Icon name="file" size={16} />
            <span>{en.composer.attach}</span>
          </button>
          <span className="spacer" />
          <button
            type="button"
            className={`btn btn-icon btn-voice${listening ? ' is-live' : ''}`}
            aria-pressed={listening}
            aria-label={listenMode === 'push' ? en.composer.voice : en.composer.voiceToggle}
            {...voiceProps}
          >
            <Icon name="mic" size={18} />
          </button>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={() => tasks.cancel(running.id)}>
              <Icon name="stop" size={14} />
              <span>{en.composer.cancel}</span>
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" disabled aria-disabled="true">
              {en.composer.cancelNone}
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            <Icon name="send" size={14} />
            <span>{en.composer.send}</span>
          </button>
        </div>
        {attach ? <p className="small faint composer-hint">{en.composer.attachHint}</p> : null}
        {linked ? (
          <p className="composer-hint">
            <Chip>
              {en.thread.followUp}: {linked.objective.slice(0, 40)}
            </Chip>
          </p>
        ) : null}
      </form>
    </div>
  );
}
