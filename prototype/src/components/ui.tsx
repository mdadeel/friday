import type { ReactNode } from 'react';
import { DISPLAY_TZ } from '../services/mock/logic';

export type Tone = 'ok' | 'warn' | 'error' | 'info' | 'muted' | 'accent';

export function Badge({ tone = 'muted', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Every simulated surface carries this label so nobody mistakes it for real behaviour. */
export function SimBadge({ label = 'Simulated' }: { label?: string }) {
  return (
    <span className="badge badge-sim" title="This value is produced by the prototype's mock service, not by a real system.">
      {label}
    </span>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`toggle${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const ICON_PATHS: Record<string, string> = {
  chat: 'M4 5h16v11H8l-4 4z',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  memory: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',
  plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
  route: 'M6 3v12M18 9v12M6 15a6 6 0 0 0 6-6h0a6 6 0 0 1 6-6',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 3l2-1-2-4-2 .8a7 7 0 0 0-1.6-1L16 4h-4l-.4 2a7 7 0 0 0-1.6 1L8 6 6 10l2 1a7 7 0 0 0 0 2l-2 1 2 4 2-.8a7 7 0 0 0 1.6 1L12 20h4l.4-2a7 7 0 0 0 1.6-1l2 .8 2-4-2-1z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-6 9a6 6 0 0 0 12 0M12 18v3',
  stop: 'M6 6h12v12H6z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  check: 'M5 12l4 4 10-10',
  x: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12l4 4',
  refresh: 'M4 12a8 8 0 0 1 14-5l2-2v6h-6l2.5-2.5A6 6 0 0 0 6 12',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
};

export function Icon({ name, size = 18 }: { name: keyof typeof ICON_PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

/** Formats an ISO time in the owner's time zone (Asia/Dhaka by default). */
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: DISPLAY_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { timeZone: DISPLAY_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
