import { useEffect } from 'react';
import { PromptKitShell } from './components/PromptKitShell';
import { useRoute } from './app/router';
import { useObservable, useServices } from './app/services';
import { PromptKitConversation } from './screens/PromptKitConversation';
import { OverlayScreen } from './screens/Overlay';
import { ActivityScreen } from './screens/Activity';
import { MemoryScreen } from './screens/Memory';
import { CapabilitiesScreen } from './screens/Capabilities';
import { RoutingScreen } from './screens/Routing';
import { SettingsScreen } from './screens/Settings';

export default function App() {
  const route = useRoute();
  const s = useServices();
  const settings = useObservable(s.settings);

  // Appearance settings apply immediately; they are the only settings with live effect in the prototype.
  useEffect(() => {
    const a = settings.appearance ?? {};
    const root = document.documentElement;
    root.dataset.theme = String(a.theme ?? 'dark');
    root.dataset.accent = String(a.accent ?? 'cyan');
    root.dataset.density = String(a.density ?? 'comfortable');
    root.dataset.motion = a.reducedMotion ? 'reduced' : 'normal';
    root.style.setProperty('--font-scale', String(Number(a.fontScale ?? 100) / 100));
  }, [settings]);

  if (route.name === 'overlay') return <OverlayScreen />;

  let screen;
  switch (route.name) {
    case 'activity':
      screen = <ActivityScreen />;
      break;
    case 'memory':
      screen = <MemoryScreen />;
      break;
    case 'capabilities':
      screen = <CapabilitiesScreen />;
      break;
    case 'routing':
      screen = <RoutingScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen section={route.section} />;
      break;
    case 'chat':
    default:
      screen = <PromptKitConversation />;
  }
  return <PromptKitShell route={route.name}>{screen}</PromptKitShell>;
}
