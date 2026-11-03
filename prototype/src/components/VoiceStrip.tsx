import type { VoiceSnapshot } from '../types/contracts';
import { useServices } from '../app/services';
import { Badge, Meter, SimBadge } from './ui';

const LABEL: Record<VoiceSnapshot['state'], string> = {
  Off: 'Off',
  Idle: 'Idle',
  Listening: 'Listening',
  Transcribing: 'Transcribing',
  Finalising: 'Finalising',
  Dispatching: 'Dispatching',
  Thinking: 'Thinking',
  Speaking: 'Speaking',
  Interrupted: 'Interrupted',
};

/** Push-to-talk strip. Pressing the button reveals a canned phrase; no microphone is opened. */
export function VoiceStrip({ voice }: { voice: VoiceSnapshot }) {
  const s = useServices();
  const listening = voice.state === 'Listening';
  return (
    <div className="voice-strip" aria-label="Voice">
      <div className="voice-state">
        <Badge tone={listening ? 'accent' : voice.state === 'Speaking' ? 'info' : 'muted'}>{LABEL[voice.state]}</Badge>
        <SimBadge label="No mic" />
      </div>
      <div className="voice-caption" aria-live="polite">
        {voice.partial ? <span>{voice.partial}</span> : <span className="muted">Hold the button to speak. Simulated: a canned phrase is used.</span>}
      </div>
      <Meter value={voice.level} label="Input level (simulated)" />
      <div className="voice-actions">
        <button
          type="button"
          className={`btn ${listening ? 'danger' : 'primary'} ptt`}
          aria-pressed={listening}
          onPointerDown={() => s.voice.pressToTalk()}
          onPointerUp={() => s.voice.release()}
          onPointerLeave={() => listening && s.voice.release()}
          onKeyDown={(e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) s.voice.pressToTalk();
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') s.voice.release();
          }}
        >
          {listening ? 'Listening… release to send' : 'Hold to talk'}
        </button>
        {voice.state === 'Speaking' && (
          <button type="button" className="btn ghost" onClick={() => s.voice.bargeIn()}>
            Interrupt
          </button>
        )}
      </div>
    </div>
  );
}
