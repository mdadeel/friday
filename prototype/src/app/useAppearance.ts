// Applies the Appearance settings to the document root. Values take effect immediately (spec §4.13).
import { useEffect } from 'react';
import type { SettingsValues } from '../services/contracts';

export function useAppearance(values: SettingsValues): void {
  const a = values.appearance;
  const theme = String(a.theme);
  const accent = String(a.accent);
  const density = String(a.density);
  const fontScale = Number(a.fontScale);
  const reduced = Boolean(a.reducedMotion);

  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
    const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    root.dataset.theme = resolved;
    if (accent === 'cyan') delete root.dataset.accent;
    else root.dataset.accent = accent;
    root.dataset.density = density;
    root.dataset.motion = reduced ? 'reduced' : 'full';
    root.style.setProperty('--font-scale', String(fontScale / 100));
  }, [theme, accent, density, fontScale, reduced]);
}
