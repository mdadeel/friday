import { en } from '../i18n/en';
import type { SectionDef } from '../data/settingsSchema';
import { TextField } from './TextField';

/** Left list of the 14 settings sections, with a search box that filters by title, purpose and setting labels. */
export function SettingsSidebar({ sections, selected, query, onQuery, onSelect }: { sections: SectionDef[]; selected: string; query: string; onQuery: (q: string) => void; onSelect: (id: string) => void }) {
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      <TextField label={en.settings.search} type="search" value={query} onChange={onQuery} placeholder={en.settings.search} />
      {sections.length === 0 ? <p className="empty">{en.settings.noResults}</p> : null}
      <ol className="settings-list">
        {sections.map((s, i) => (
          <li key={s.id}>
            <a
              href={`#/settings/${s.id}`}
              className={`settings-item${s.id === selected ? ' is-active' : ''}`}
              aria-current={s.id === selected ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                onSelect(s.id);
              }}
            >
              <span className="faint small mono">{String(i + 1).padStart(2, '0')}</span>
              <span>{s.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
