import { en } from '../i18n/en';
import type { RouteName } from '../app/router';
import { Icon } from './Icon';
import type { ReactNode } from 'react';

const ITEMS: { id: RouteName; label: string; icon: 'chat' | 'activity' | 'memory' | 'capabilities' | 'routing' | 'settings' | 'overlay' }[] = [
  { id: 'chat', label: en.nav.chat, icon: 'chat' },
  { id: 'activity', label: en.nav.activity, icon: 'activity' },
  { id: 'memory', label: en.nav.memory, icon: 'memory' },
  { id: 'capabilities', label: en.nav.capabilities, icon: 'capabilities' },
  { id: 'routing', label: en.nav.routing, icon: 'routing' },
  { id: 'settings', label: en.nav.settings, icon: 'settings' },
  { id: 'overlay', label: en.nav.overlay, icon: 'overlay' },
];

/** Left rail: main navigation with visible labels (collapsible to icons), plus recent tasks as history. */
export function Rail({ active, collapsed, onToggle, history }: { active: RouteName; collapsed: boolean; onToggle: () => void; history: ReactNode }) {
  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-top">
        {!collapsed ? <span className="brand">{en.app.name}</span> : null}
        <button type="button" className="btn btn-icon btn-ghost" onClick={onToggle} aria-label={collapsed ? en.nav.expand : en.nav.collapse} aria-expanded={!collapsed}>
          <Icon name={collapsed ? 'expand' : 'collapse'} size={18} />
        </button>
      </div>
      <ul className="rail-list">
        {ITEMS.map((item) => {
          const selected = item.id === active;
          return (
            <li key={item.id}>
              <a href={`#/${item.id}`} className={`rail-item${selected ? ' is-active' : ''}`} aria-current={selected ? 'page' : undefined} title={collapsed ? item.label : undefined}>
                <Icon name={item.icon} size={18} />
                <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
      {!collapsed ? history : null}
    </nav>
  );
}
