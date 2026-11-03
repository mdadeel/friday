import type { VoiceSnapshot } from '../types/contracts';
import { Meter } from './Meter';

/** Live caption above the input: partial text is muted and becomes solid once final. Level meter is thin. */
export function CaptionStrip({ voice }: { voice: VoiceSnapshot }) {
  const listening = voice.state === 'Listening';
  const finalising = ['Finalising', 'Dispatching', 'Thinking'].includes(voice.state);
  if (!listening && !finalising) return null;
  return (
    <div className="caption" aria-live="polite">
      <span className={listening ? 'caption-partial' : 'caption-final'}>{voice.partial || 'Listening…'}</span>
      {listening ? <Meter value={voice.level} label="Input level" /> : null}
    </div>
  );
}
