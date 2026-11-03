import type { CSSProperties } from 'react';

export type CoreState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

const LABEL: Record<CoreState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error',
};

/**
 * The overlay core. Four states plus error (spec §3.6). Idle breathes, listening pulses with level,
 * thinking rotates segments at constant speed, speaking shows radial bars, error is one amber ring.
 * Colour is never the only signal: the label is always present. Reduced motion stops all loops.
 */
export function Core({ state, level = 0, size = 96 }: { state: CoreState; level?: number; size?: number }) {
  const bars = Array.from({ length: 12 }, (_, i) => i);
  const style = { width: size, height: size } as CSSProperties;
  return (
    <div className={`core core-${state}`} style={style} role="img" aria-label={`EDITH state: ${LABEL[state]}`}>
      <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true" focusable="false">
        <circle className="core-ring-outer" cx="60" cy="60" r="56" />
        <g className="core-ticks">
          {bars.map((i) => (
            <line key={i} x1="60" y1="6" x2="60" y2="12" transform={`rotate(${i * 30} 60 60)`} />
          ))}
        </g>
        <g className="core-segments">
          <circle cx="60" cy="60" r="44" pathLength={100} strokeDasharray="18 7" />
        </g>
        <circle className="core-pulse" cx="60" cy="60" r={36 + Math.round(level * 8)} style={{ opacity: 0.25 + level * 0.5 }} />
        <circle className="core-body" cx="60" cy="60" r="30" />
        <g className="core-bars">
          {bars.map((i) => {
            const h = 6 + Math.round(level * 14 * (0.5 + 0.5 * Math.sin(i * 1.7)));
            return <line key={i} x1="60" y1={30 - 2} x2="60" y2={30 - 2 - h} transform={`rotate(${i * 30} 60 60)`} />;
          })}
        </g>
        <circle className="core-amber" cx="60" cy="60" r="52" />
      </svg>
      <span className="sr-only">{LABEL[state]}</span>
    </div>
  );
}
