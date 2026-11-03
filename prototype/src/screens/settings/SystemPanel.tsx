import { en } from '../../i18n/en';
import { Badge } from '../../components/Badge';
import { SimBadge } from '../../components/SimBadge';
import { Icon } from '../../components/Icon';
import { useState } from 'react';

const FACTS: [string, string][] = [
  ['Application version', '0.1.0 (prototype)'],
  ['API version', 'not applicable (no daemon)'],
  ['Socket path (designed, not observed)', '$XDG_RUNTIME_DIR/edith/api.sock (mode 0600, per the blueprint)'],
  ['Storage usage', 'not observable in the browser'],
  ['Database backup', 'not applicable (no database)'],
  ['GPU and RAM', 'not observable in the browser'],
];

/** System facts. The browser cannot observe the platform, so those values say so. */
export function SystemPanel() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <section className="panel stack" aria-labelledby="facts-h">
        <div className="row gap">
          <h3 id="facts-h">{en.settings.systemFacts}</h3>
          <SimBadge compact />
        </div>
        <dl className="kv">
          {FACTS.map(([k, v]) => (
            <div key={k} className="kv-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="row gap wrap">
          <button
            type="button"
            className="btn"
            onClick={() => {
              void navigator.clipboard?.writeText('$XDG_RUNTIME_DIR/edith/api.sock').then(() => setCopied(true), () => setCopied(false));
            }}
          >
            <Icon name="copy" size={14} />
            <span>{en.settings.copy}</span>
          </button>
          {copied ? <span className="small ok-text">Socket path copied.</span> : null}
        </div>
      </section>
      <section className="panel stack" aria-labelledby="overlay-h">
        <h3 id="overlay-h">Overlay mode</h3>
        <p className="small">
          The active mode is decided by the desktop build. This browser prototype cannot detect it. <Badge tone="muted">Unknown</Badge>
        </p>
        <p className="small faint">Keep-on-top is a best-effort hint in mode C. The guarantee is strong only in mode A.</p>
      </section>
      <section className="panel stack" aria-labelledby="restart-h">
        <h3 id="restart-h">Daemon</h3>
        <p className="small faint">Status: not connected (prototype). {en.settings.restartNote}</p>
        <button type="button" className="btn" disabled title={en.settings.restartNote}>
          Restart daemon
        </button>
      </section>
    </div>
  );
}
