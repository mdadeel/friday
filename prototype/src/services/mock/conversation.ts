import { Store } from '../store';
import type { ConversationService, DiagnosticsService, MemoryService, RoutingService, TaskService } from '../contracts';
import type { ChatMessage } from '../../types/contracts';
import { buildRoute, classifyIntent, DISPLAY_TZ, evaluateExpression, formatInDisplayTz, tier0Match } from './logic';
import { nextId, nowIso } from './ids';

const WELCOME: ChatMessage = {
  id: 'msg-welcome',
  role: 'edith',
  kind: 'notice',
  text:
    'EDITH prototype. Everything here is simulated: no model, microphone, search or device is connected. ' +
    'Try "What time is it?", "what is 12 * (3 + 4)", "Who am I?", or "Research the best architecture for our MCP host".',
  at: nowIso(),
  source: 'text',
  simulated: true,
};

const STREAM_MS = 35;

export function createConversationService(deps: {
  tasks: TaskService;
  memory: MemoryService;
  routing: RoutingService;
  diag: DiagnosticsService;
  onReplyComplete: (text: string, source: 'text' | 'voice') => void;
}): ConversationService {
  const store = new Store<ChatMessage[]>([WELCOME]);
  let streamHandle: ReturnType<typeof setInterval> | null = null;

  const append = (m: ChatMessage): void => {
    store.set((list) => [...list, m]);
  };

  const streamReply = (text: string, route: ReturnType<typeof buildRoute>, source: 'text' | 'voice'): void => {
    const id = nextId('msg');
    const words = text.split(/(\s+)/);
    append({ id, role: 'edith', kind: 'text', text: '', at: nowIso(), source, route, streaming: true, simulated: true });
    let i = 0;
    if (streamHandle) clearInterval(streamHandle);
    streamHandle = setInterval(() => {
      i = Math.min(words.length, i + 2);
      const partial = words.slice(0, i).join('');
      store.set((list) => list.map((m) => (m.id === id ? { ...m, text: partial, streaming: i < words.length } : m)));
      if (i >= words.length) {
        if (streamHandle) clearInterval(streamHandle);
        streamHandle = null;
        deps.onReplyComplete(text, source);
      }
    }, STREAM_MS);
  };

  const handleTier0 = (text: string, source: 'text' | 'voice'): void => {
    const hit = tier0Match(text);
    const started = performance.now();
    const now = new Date();
    let answer: string;
    if (hit?.intent === 'time') {
      answer = `It is ${formatInDisplayTz(now, 'time')} in ${DISPLAY_TZ}.`;
    } else if (hit?.intent === 'date') {
      answer = `Today is ${formatInDisplayTz(now, 'date')} (${DISPLAY_TZ}).`;
    } else {
      try {
        answer = `${hit?.expr} = ${evaluateExpression(hit?.expr ?? '')}`;
      } catch (e) {
        answer = `I could not evaluate that: ${(e as Error).message}.`;
      }
    }
    const latency = Math.max(1, Math.round(performance.now() - started));
    const route = buildRoute(nextId('rt'), nowIso(), hit?.intent ?? 'chat', latency);
    deps.routing.record(route);
    deps.diag.log('router', 'debug', `T0 ${hit?.intent} answered locally (${latency} ms)`, route.id);
    streamReply(answer, route, source);
  };

  const send = (raw: string, source: 'text' | 'voice' = 'text'): void => {
    const text = raw.trim();
    if (!text) return;
    append({ id: nextId('msg'), role: 'owner', kind: 'text', text, at: nowIso(), source });

    const intent = classifyIntent(text);
    if (intent === 'time' || intent === 'date' || intent === 'calc') {
      handleTier0(text, source);
      return;
    }

    if (intent === 'personal') {
      const r = deps.memory.whoAmI();
      const route = buildRoute(nextId('rt'), nowIso(), 'personal', 1400);
      deps.routing.record(route);
      const cite = r.usedIds.length ? ` [memory: ${r.usedIds.join(', ')}]` : '';
      streamReply(r.text + cite, route, source);
      return;
    }

    if (intent === 'research' || intent === 'code' || intent === 'continue') {
      const route = buildRoute(nextId('rt'), nowIso(), intent, 0);
      deps.routing.record(route);
      const taskId = deps.tasks.start(text, intent, source, route);
      append({ id: nextId('msg'), role: 'edith', kind: 'task', text: '', at: nowIso(), source, taskId, simulated: true });
      streamReply(
        `Started a simulated task. Route: ${route.tier} · ${route.model ?? 'no model'}. ` +
          'The plan, approvals and verification are shown in the Now panel and in Activity. Nothing external is touched.',
        route,
        source,
      );
      return;
    }

    const route = buildRoute(nextId('rt'), nowIso(), 'chat', 0);
    deps.routing.record(route);
    streamReply(
      '[SIMULATED] No model is connected in this prototype, so I cannot give a real answer. ' +
        'In the real system this request would go to the Tier 2 route shown below. ' +
        'Requests about time, arithmetic, your memory, research or code tasks do run in this prototype.',
      route,
      source,
    );
  };

  const reset = (): void => {
    if (streamHandle) clearInterval(streamHandle);
    streamHandle = null;
    store.set(() => [{ ...WELCOME, id: nextId('msg'), at: nowIso() }]);
  };

  return { get: store.get, subscribe: store.subscribe, send, reset };
}
