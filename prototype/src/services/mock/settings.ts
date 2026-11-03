import { Store } from '../store';
import type { DiagnosticsService, SettingsService, SettingsValues } from '../contracts';
import { defaultSettings } from '../../data/settingsSchema';

export function createSettingsService(diag: DiagnosticsService): SettingsService {
  const store = new Store<SettingsValues>(defaultSettings());

  const set: SettingsService['set'] = (section, key, value) => {
    store.set((s) => ({ ...s, [section]: { ...s[section], [key]: value } }));
    diag.log('settings', 'debug', `${section}.${key} set (prototype only, not persisted)`);
  };

  const reset: SettingsService['reset'] = () => {
    store.set(() => defaultSettings());
    diag.log('settings', 'info', 'settings reset to defaults (prototype)');
  };

  return { get: store.get, subscribe: store.subscribe, set, reset };
}
