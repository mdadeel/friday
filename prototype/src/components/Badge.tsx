import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'blue' | 'violet' | 'ok' | 'warn' | 'error' | 'muted';

/** Text is always present. Colour is supplementary. */
export function Badge({ tone = 'neutral', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}
