import type { Services } from '../contracts';
import { createConversationService } from './conversation';
import { createTaskService } from './tasks';
import { createVoiceService } from './voice';
import { createMemoryService } from './memory';
import { createRoutingService } from './routing';
import { createCapabilityService } from './capabilities';
import { createPolicyService } from './policy';
import { createSettingsService } from './settings';
import { createSearchService } from './search';
import { createDiagnosticsService } from './diagnostics';
import { createNotificationService } from './notifications';

/** Builds every simulated service. The UI only sees the interfaces in ../contracts. */
export function createMockServices(): Services {
  const diagnostics = createDiagnosticsService();
  const notifications = createNotificationService();
  const routing = createRoutingService(diagnostics);
  const memory = createMemoryService(diagnostics);
  const tasks = createTaskService({ diag: diagnostics, notify: notifications });
  let conversation: ReturnType<typeof createConversationService> | null = null;
  const voice = createVoiceService({
    diag: diagnostics,
    onFinal: (text) => conversation?.send(text, 'voice'),
  });
  conversation = createConversationService({
    tasks,
    memory,
    routing,
    diag: diagnostics,
    onReplyComplete: (text, source) => {
      if (source === 'voice') voice.speak(text);
    },
  });
  return {
    conversation,
    tasks,
    voice,
    memory,
    routing,
    capabilities: createCapabilityService(diagnostics),
    policy: createPolicyService(diagnostics),
    settings: createSettingsService(diagnostics),
    search: createSearchService(),
    diagnostics,
    notifications,
  };
}
