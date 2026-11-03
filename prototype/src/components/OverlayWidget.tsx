import { useState } from 'react';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { isActive } from '../app/presentation';
import { Core, type CoreState } from './Core';
import { OverlayPanel } from './OverlayPanel';

/** The compact overlay: core and a single caption line. Click the core to open the panel. */
export function OverlayWidget({ core, level }: { core: CoreState; level: number }) {
  const { voice, tasks } = useServices();
  const v = useObservable(voice);
  const active = useObservable(tasks).find((t) => isActive(t.state));
  const [open, setOpen] = useState(false);
  const caption =
    v.state === 'Listening' && v.partial
      ? v.partial
      : active
        ? active.subtasks.find((s) => s.state === 'running')?.label ?? en.state[active.state]
        : en.overlay.states.idle;
  const short = caption.length > 60 ? `${caption.slice(0, 60)}…` : caption;
  return (
    <div className="overlay-widget">
      {open ? <OverlayPanel core={core} /> : null}
      <button type="button" className="overlay-core-btn" aria-expanded={open} aria-label={`Open EDITH panel. State: ${en.overlay.states[core]}`} onClick={() => setOpen((o) => !o)}>
        <Core state={core} size={96} level={level} />
      </button>
      <p className="overlay-caption" aria-live="polite">
        {short}
      </p>
    </div>
  );
}
