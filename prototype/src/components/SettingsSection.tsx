import type { SectionDef } from '../data/settingsSchema';
import type { SettingValue, SettingsValues } from '../services/contracts';
import { useServices } from '../app/services';
import { FieldRow } from './FieldRow';
import { PanelSlot } from '../screens/settings/PanelSlot';

/** One settings section: title, purpose, schema fields, then any section-specific panel. */
export function SettingsSection({ section, values }: { section: SectionDef; values: SettingsValues }) {
  const { settings } = useServices();
  return (
    <section className="settings-section" aria-labelledby={`sec-${section.id}`}>
      <header className="stack gap-tight">
        <h2 id={`sec-${section.id}`}>{section.title}</h2>
        <p className="faint">{section.purpose}</p>
      </header>
      {section.fields.length ? (
        <div className="settings-fields">
          {section.fields.map((f) => (
            <FieldRow
              key={f.key}
              field={f}
              value={values[section.id][f.key] as SettingValue}
              onChange={(v) => settings.set(section.id, f.key, v)}
            />
          ))}
        </div>
      ) : null}
      {section.panel ? <PanelSlot panel={section.panel} /> : null}
    </section>
  );
}
