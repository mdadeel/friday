import type { Services } from '../contracts';
import { DaemonClient } from './client';
import { createDaemonConversationService } from './conversation';
import { createDaemonVoiceService } from './voice';
import { createDaemonMemoryService } from './memory';
import { createDaemonCapabilityService } from './capabilities';
import { createDaemonDiagnosticsService } from './diagnostics';
import { createMockServices } from '../mock';

export interface DaemonOptions {
  baseUrl?: string;
  wsUrl?: string;
  token?: string;
}

/**
 * Creates live services connected directly to the EDITH 2.0 Rust daemon.
 */
export function createDaemonServices(options: DaemonOptions = {}): Services {
  const baseUrl = options.baseUrl || 'http://127.0.0.1:4242';
  const wsUrl = options.wsUrl || 'ws://127.0.0.1:4242/v1/events';
  const token =
    options.token ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token') ||
        localStorage.getItem('edith_token') ||
        'edith-local-token'
      : 'edith-local-token');

  const client = new DaemonClient({ baseUrl, wsUrl, token });
  client.connectWs();

  const mock = createMockServices();

  const diagnostics = createDaemonDiagnosticsService(client);
  const voice = createDaemonVoiceService(client, {
    onFinal: (text) => conversation.send(text, 'voice'),
  });
  const conversation = createDaemonConversationService(client);
  const memory = createDaemonMemoryService(client);
  const capabilities = createDaemonCapabilityService(client);

  return {
    ...mock,
    conversation,
    voice,
    memory,
    capabilities,
    diagnostics,
  };
}

/**
 * Auto-detects if the daemon is online. If online, uses live daemon services;
 * otherwise gracefully falls back to mock services.
 */
export async function createAutoDetectServices(): Promise<Services> {
  const client = new DaemonClient({
    baseUrl: 'http://127.0.0.1:4242',
    wsUrl: 'ws://127.0.0.1:4242/v1/events',
  });

  const isOnline = await client.probe();
  if (isOnline) {
    console.info('[EDITH] Connected to live EDITH 2.0 daemon at http://127.0.0.1:4242');
    return createDaemonServices();
  }

  console.info('[EDITH] Daemon offline, using simulated mock services');
  return createMockServices();
}
