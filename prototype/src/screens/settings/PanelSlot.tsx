import type { PanelId } from '../../data/settingsSchema';
import { ProvidersPanel } from './ProvidersPanel';
import { LocalModelsPanel } from './LocalModelsPanel';
import { RoutingPanel } from './RoutingPanel';
import { VoicePanel } from './VoicePanel';
import { MemoryPanel } from './MemoryPanel';
import { McpPanel } from './McpPanel';
import { SkillsPanel } from './SkillsPanel';
import { SearchPanel } from './SearchPanel';
import { AutonomyPanel } from './AutonomyPanel';
import { ToolPermissionsPanel } from './ToolPermissionsPanel';
import { SystemPanel } from './SystemPanel';
import { LogsPanel } from './LogsPanel';

/** Chooses the section-specific panel. General and Appearance are schema-only. */
export function PanelSlot({ panel }: { panel: PanelId }) {
  switch (panel) {
    case 'providers':
      return <ProvidersPanel />;
    case 'local-models':
      return <LocalModelsPanel />;
    case 'routing':
      return <RoutingPanel />;
    case 'voice':
      return <VoicePanel />;
    case 'memory':
      return <MemoryPanel />;
    case 'mcp':
      return <McpPanel />;
    case 'skills':
      return <SkillsPanel />;
    case 'search':
      return <SearchPanel />;
    case 'autonomy':
      return <AutonomyPanel />;
    case 'tool-permissions':
      return <ToolPermissionsPanel />;
    case 'system':
      return <SystemPanel />;
    case 'logs':
      return <LogsPanel />;
    default:
      return null;
  }
}
