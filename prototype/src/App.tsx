import { useEffect, useState } from 'react';
import { useRoute } from './app/router';
import { useObservable, useServices } from './app/services';
import { useAppearance } from './app/useAppearance';
import { AppShell } from './components/AppShell';
import { ConversationScreen } from './screens/ConversationScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { MemoryScreen } from './screens/MemoryScreen';
import { CapabilitiesScreen } from './screens/CapabilitiesScreen';
import { RoutingScreen } from './screens/RoutingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { OverlayScreen } from './screens/OverlayScreen';

/** Root: applies appearance settings, then renders the screen for the current hash route. */
export default function App() {
  const route = useRoute();
  const { settings } = useServices();
  const values = useObservable(settings);
  const [collapsed, setCollapsed] = useState(false);
  useAppearance(values);

  useEffect(() => {
    document.title = `${route.name[0].toUpperCase()}${route.name.slice(1)} · EDITH (simulated prototype)`;
  }, [route.name]);

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
      screen = <SettingsScreen />;
      break;
    case 'overlay':
      screen = <OverlayScreen />;
      break;
    default:
      screen = <ConversationScreen />;
  }

  return (
    <AppShell route={route.name} collapsed={collapsed} onToggleRail={() => setCollapsed((c) => !c)}>
      {screen}
    </AppShell>
  );
}
