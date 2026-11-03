import { useObservable, useServices } from '../../app/services';
import { voiceTone } from '../../app/presentation';
import { en } from '../../i18n/en';
import { StatusDot } from '../../components/StatusDot';
import { Badge } from '../../components/Badge';
import { SimBadge } from '../../components/SimBadge';

/** Voice configuration. The prototype never opens a microphone; the device list is a placeholder. */
export function VoicePanel() {
  const { voice, settings } = useServices();
  const v = useObservable(voice);
  const vocab = useObservable(settings).voice.vocabulary as string[];
  return (
    <div className="panel stack">
      <div className="row gap wrap"><h3>Devices and engine</h3><SimBadge compact /></div>
      <p className="small">
        Input device: <span className="faint">{v.device}</span>
      </p>
      <p className="small">
        Engine: <Badge tone={v.engine === 'gemini_live_cloud' ? 'violet' : 'accent'}>{v.engine === 'gemini_live_cloud' ? 'Gemini Live (cloud)' : 'Whisper (local)'}</Badge>
      </p>
      <div className="row gap wrap">
        <button type="button" className="btn" onClick={() => voice.setEngine('whisper_local', false)} disabled={v.engine === 'whisper_local'}>
          Use local Whisper
        </button>
        <button type="button" className="btn" onClick={() => voice.setEngine('gemini_live_cloud', true)} disabled={v.engine === 'gemini_live_cloud'}>
          Use Gemini Live (cloud, consent)
        </button>
      </div>
      <p className="small faint">Cloud engine needs explicit consent and sends audio off this machine. Consent here is simulated.</p>
      <div className="row gap">
        <span className="small">Microphone state:</span>
        <StatusDot tone={voiceTone(v.state)} label={`${en.voice[v.state]} · mic ${v.micOpen ? 'open' : 'closed'}`} />
      </div>
      <div className="row gap wrap">
        <span className="small">Custom vocabulary:</span>
        {vocab.map((w) => (
          <Badge key={w} tone="muted">
            {w}
          </Badge>
        ))}
      </div>
      <p className="small faint">Echo protection is a gate (G5). Barge-in reliability is not established.</p>
    </div>
  );
}
