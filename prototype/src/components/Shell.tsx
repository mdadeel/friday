import type { ReactNode } from 'react';
import type { RouteName } from '../app/router';
import { useObservable, useServices } from '../app/services';
import { Badge, Icon, SimBadge } from './ui';

const NAV: { name: RouteName; label: string; icon: string; hint: string }[] = [
  { name: 'chat', label: 'Conversation', icon: 'chat', hint: 'Talk, type, see the Now panel' },
  { name: 'activity', label: 'Activity', icon: 'activity', hint: 'Tasks, plans, approvals, verification' },
  { name: 'memory', label: 'Memory', icon: 'memory', hint: 'Review what EDITH knows about you' },
  { name: 'capabilities', label: 'Capabilities', icon: 'plug', hint: 'MCP servers and skills' },
  { name: 'routing', label: 'Routing', icon: 'route', hint: 'Which model handles what' },
  { name: 'settings', label: 'Settings', icon: 'settings', hint: 'Preferences, permissions, system' },
];

const TITLES: Record<string, string> = {
  chat: 'Conversation',
  activity: 'Activity',
  memory: 'Memory',
  capabilities: 'Capabilities',
  routing: 'Routing',
  settings: 'Settings',
};

export function Shell({ route, children }: { route: RouteName; children: ReactNode }) {
  const s = useServices();
  const tasks = useObservable(s.tasks);
  const approvals = useObservable(s.tasks.approvals);
  const voice = useObservable(s.voice);
  const routing = useObservable(s.routing);
  const pending = approvals.filter((a) => a.status === 'pending').length;
  const active = tasks.filter((t) => !['Completed', 'Failed', 'Cancelled'].includes(t.state)).length;
  const lastTier = routing.recent[0]?.tier ?? '—';

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="rail" aria-label="Primary">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">E</span>
          <div>
            <div className="brand-name">EDITH</div>
            <div className="brand-sub">prototype</div>
          </div>
        </div>
        <nav>
          <ul>
            {NAV.map((n) => (
              <li key={n.name}>
                <a href={`#/${n.name}`} className={route === n.name ? 'nav-link is-current' : 'nav-link'} aria-current={route === n.name ? 'page' : undefined} title={n.hint}>
                  <Icon name={n.icon} />
                  <span>{n.label}</span>
                  {n.name === 'activity' && pending > 0 && <span className="count count-warn" aria-label={`${pending} approvals waiting`}>{pending}</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="rail-foot">
          <a href="#/overlay" className="nav-link subtle">
            <Icon name="eye" />
            <span>Overlay preview</span>
          </a>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <h1>{TITLES[route] ?? 'EDITH'}</h1>
          <div className="topbar-badges">
            <Badge tone="warn" title="No real model, microphone, search or device is used.">Prototype — no real integrations</Badge>
            <SimBadge label="All data simulated" />
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
        <footer className="statusbar" role="status" aria-live="polite">
          <span className="status-item">
            <span className={`dot dot-${voice.state === 'Listening' ? 'accent' : voice.state === 'Speaking' ? 'info' : 'muted'}`} aria-hidden="true" />
            Voice: {voice.state} <span className="muted">(microphone {voice.micOpen ? 'open — simulated' : 'closed'})</span>
          </span>
          <span className="status-item">Daemon: not connected (prototype)</span>
          <span className="status-item">Active tasks: {active}</span>
          <span className="status-item">Last route: {lastTier}</span>
          <span className="status-item">Time zone: Asia/Dhaka</span>
        </footer>
      </div>
    </div>
  );
}
