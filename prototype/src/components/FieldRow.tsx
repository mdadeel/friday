import type { FieldDef } from '../data/settingsSchema';
import { APPLY_LABEL } from '../data/settingsSchema';
import type { SettingValue } from '../services/contracts';
import { Toggle } from './Toggle';
import { SelectField } from './SelectField';
import { NumberField } from './NumberField';
import { TextField } from './TextField';
import { Badge } from './Badge';

/** One schema-driven setting. Shows what happens when it changes: "Applies now", "Kept for this session" or "Needs daemon restart". */
export function FieldRow({ field, value, onChange }: { field: FieldDef; value: SettingValue; onChange: (v: SettingValue) => void }) {
  const applyTone = field.apply === 'now' ? 'ok' : field.apply === 'restart' ? 'warn' : 'muted';
  const applyBadge = <Badge tone={applyTone}>{APPLY_LABEL[field.apply]}</Badge>;
  return (
    <div className="setting-row">
      <div className="setting-control">
        {field.kind === 'toggle' ? (
          <div className="row between gap">
            <span className="setting-label">{field.label}</span>
            <Toggle label={field.label} checked={Boolean(value)} onChange={(v) => onChange(v)} />
          </div>
        ) : null}
        {field.kind === 'select' ? (
          <SelectField label={field.label} value={String(value)} options={field.options} onChange={(v) => onChange(v)} help={field.help} />
        ) : null}
        {field.kind === 'number' ? (
          <NumberField label={field.label} value={Number(value)} min={field.min} max={field.max} step={field.step} unit={field.unit} onChange={(v) => onChange(v)} help={field.help} />
        ) : null}
        {field.kind === 'text' ? <TextField label={field.label} value={String(value)} onChange={(v) => onChange(v)} help={field.help} /> : null}
        {field.kind === 'toggle' && field.help ? <p className="field-help">{field.help}</p> : null}
      </div>
      <div className="setting-meta">{applyBadge}</div>
    </div>
  );
}
