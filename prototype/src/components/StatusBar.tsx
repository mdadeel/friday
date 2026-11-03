import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { voiceTone } from '../app/presentation';
import { StatusDot } from './StatusDot';
import { SimBadge } from './SimBadge';
import { Badge } from './Badge';
import { navigate } from '../app/router';

/** Status bar: daemon, route, microphone and voice state, and the persistent SIMULATED label. */
export function StatusBar() {
  const { voice, routing } = useServices();
  const v = useObservable(voice);
  const r = useObservable(routing);
  const last = r.recent[0];
  return (
    <footer className="statusbar" role="contentinfo">
      <StatusDot tone="muted" label={`${en.status.daemon}: ${en.status.daemonValue}`} />
      <button type="button" className="btn btn-ghost btn-small" onClick={() => navigate('/routing')}>
        {en.status.route}: {last ? `${last.tier} · ${last.model ?? en.route.noModel}` : en.route.noModel}
      </button>
      <span className="statusbar-mic">
        {en.status.mic}: <Badge tone={v.micOpen ? 'warn' : 'muted'}>{v.micOpen ? en.status.micOpen : en.status.micClosed}</Badge>
      </span>
      <StatusDot tone={voiceTone(v.state)} label={`Voice: ${en.voice[v.state]}`} />
      <span className="spacer" />
      <SimBadge />
    </footer>
  );
}
