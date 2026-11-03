import { useState } from 'react';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { useCoreState } from '../app/useCoreState';
import type { CoreState } from '../components/Core';
import { OverlayWidget } from '../components/OverlayWidget';
import { SegmentedControl } from '../components/SegmentedControl';
import { SelectField } from '../components/SelectField';
import { SimBadge } from '../components/SimBadge';

type Preview = 'live' | CoreState;
type Visibility = 'always' | 'task' | 'hidden';

/** Browser preview of the holographic overlay: all core states, the expanded panel, and the platform modes. */
export function OverlayScreen() {
  const { voice } = useServices();
  const live = useCoreState();
  const v = useObservable(voice);
  const [preview, setPreview] = useState<Preview>('live');
  const [visibility, setVisibility] = useState<Visibility>('always');
  const core: CoreState = preview === 'live' ? live : preview;
  const states: CoreState[] = ['idle', 'listening', 'thinking', 'speaking', 'error'];
  const stateNotes: Record<CoreState, string> = {
    idle: 'Slow breathing motion.',
    listening: 'Ring pulses with input level.',
    thinking: 'Segments rotate at constant speed.',
    speaking: 'Radial bars follow output level.',
    error: 'One amber ring. No flashing.',
  };

  return (
    <div className="stack screen">
      <p className="screen-intro">{en.overlay.intro}</p>
      <div className="row gap wrap">
        <SimBadge />
        <span className="small faint">{en.overlay.previewOnly}</span>
      </div>

      <div className="overlay-layout">
        <section className="overlay-stage panel" aria-label="Overlay preview">
          <p className="small faint">Browser preview. The desktop is simulated.</p>
          {visibility === 'hidden' ? (
            <p className="empty">Hidden: the overlay is in the tray only.</p>
          ) : (
            <OverlayWidget core={core} level={v.level} />
          )}
        </section>
        <div className="stack">
          <section className="panel stack" aria-labelledby="ov-controls">
            <h2 id="ov-controls">Controls</h2>
            <div className="stack gap-tight">
              <span className="field-label" id="preview-label">
                {en.overlay.previewState}
              </span>
              <SegmentedControl<Preview>
                label={en.overlay.previewState}
                value={preview}
                onChange={setPreview}
                options={[{ value: 'live', label: en.overlay.live }, ...states.map((s) => ({ value: s, label: en.overlay.states[s] }))]}
              />
            </div>
            <SelectField
              label={en.overlay.visibility}
              value={visibility}
              onChange={(v) => setVisibility(v as Visibility)}
              options={[
                ['always', en.overlay.visibilityOpts.always],
                ['task', en.overlay.visibilityOpts.task],
                ['hidden', en.overlay.visibilityOpts.hidden],
              ]}
            />
          </section>
          <section className="panel" aria-labelledby="ov-states">
            <h2 id="ov-states">The four core states</h2>
            <ul className="stack gap-tight">
              {states.map((s) => (
                <li key={s} className="small">
                  <strong>{en.overlay.states[s]}</strong> — {stateNotes[s]}
                </li>
              ))}
            </ul>
          </section>
          <section className="panel" aria-labelledby="ov-modes">
            <h2 id="ov-modes">{en.overlay.mode}</h2>
            <table className="table">
              <caption className="sr-only">Overlay platform modes</caption>
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Used when</th>
                  <th scope="col">Always-on-top</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>A — layer surface</td>
                  <td>A supported compositor protocol is available</td>
                  <td>Strong</td>
                </tr>
                <tr>
                  <td>B — XWayland window</td>
                  <td>Running under XWayland or X11</td>
                  <td>Good (window manager dependent)</td>
                </tr>
                <tr>
                  <td>C — normal window</td>
                  <td>Fallback</td>
                  <td>None. Keep-on-top is a best-effort hint.</td>
                </tr>
              </tbody>
            </table>
            <p className="small faint">The browser preview cannot detect the platform mode. The desktop build is not in this prototype (see docs/edith, desktop overlay).</p>
          </section>
        </div>
      </div>
    </div>
  );
}
