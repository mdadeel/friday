import { useMemo, useState } from 'react';
import { en } from '../i18n/en';
import { useObservable, useServices } from '../app/services';
import { useRoute, navigate } from '../app/router';
import { SECTIONS } from '../data/settingsSchema';
import { SettingsSidebar } from '../components/SettingsSidebar';
import { SettingsSection } from '../components/SettingsSection';
import { Dialog } from '../components/Dialog';
import { SimBadge } from '../components/SimBadge';

/** Settings: 14 sections in spec order, search by label, values kept for this browser session only. */
export function SettingsScreen() {
  const { settings } = useServices();
  const values = useObservable(settings);
  const route = useRoute();
  const [query, setQuery] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const selectedId = SECTIONS.some((s) => s.id === route.section) ? (route.section as string) : 'general';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(
      (s) => s.title.toLowerCase().includes(q) || s.purpose.toLowerCase().includes(q) || s.fields.some((f) => f.label.toLowerCase().includes(q)),
    );
  }, [query]);

  const current = SECTIONS.find((s) => s.id === selectedId) ?? SECTIONS[0];

  return (
    <div className="settings-layout">
      <SettingsSidebar
        sections={visible}
        selected={selectedId}
        query={query}
        onQuery={setQuery}
        onSelect={(id) => navigate(`/settings/${id}`)}
      />
      <div className="settings-main">
        <div className="row between wrap gap settings-top">
          <p className="small faint">Values stay in this browser session. The prototype does not save them to disk.</p>
          <div className="row gap">
            <SimBadge compact />
            <button type="button" className="btn" onClick={() => setResetOpen(true)}>
              {en.settings.resetAll}
            </button>
          </div>
        </div>
        <SettingsSection section={current} values={values} />
      </div>
      {resetOpen ? (
        <Dialog
          title={en.settings.resetAll}
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setResetOpen(false)}>
                {en.settings.cancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  settings.reset();
                  setResetOpen(false);
                }}
              >
                {en.settings.confirm}
              </button>
            </>
          }
        >
          <p>{en.settings.resetConfirm}</p>
        </Dialog>
      ) : null}
    </div>
  );
}
