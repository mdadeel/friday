import type { ReactNode } from 'react';
import { en } from '../i18n/en';
import type { RouteName } from '../app/router';
import { Rail } from './Rail';
import { HistoryList } from './HistoryList';
import { StatusBar } from './StatusBar';
import { NotificationStack } from './NotificationStack';
import { SimBadge } from './SimBadge';

const TITLES: Record<RouteName, string> = {
  chat: en.nav.chat,
  activity: en.nav.activity,
  memory: en.nav.memory,
  capabilities: en.nav.capabilities,
  routing: en.nav.routing,
  settings: en.nav.settings,
  overlay: en.nav.overlay,
};

/** Frame for every screen: rail, page header with SIMULATED label, main landmark, status bar. */
export function AppShell({ route, collapsed, onToggleRail, children }: { route: RouteName; collapsed: boolean; onToggleRail: () => void; children: ReactNode }) {
  return (
    <div className="app" data-rail={collapsed ? 'collapsed' : 'open'}>
      <a className="skip-link" href="#main">
        {en.app.skip}
      </a>
      <Rail active={route} collapsed={collapsed} onToggle={onToggleRail} history={<HistoryList />} />
      <div className="workspace">
        <header className="page-head">
          <h1>{TITLES[route]}</h1>
          <SimBadge />
        </header>
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <StatusBar />
      <NotificationStack />
    </div>
  );
}
