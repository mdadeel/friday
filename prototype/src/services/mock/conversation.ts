import { Store } from '../store';
import type { ConversationService, DiagnosticsService, MemoryService, RoutingService, SendOptions, TaskService } from '../contracts';
import type { ChatMessage, TaskIntent } from '../../types/contracts';
import { buildRoute, classifyIntent, DISPLAY_TZ, evaluateExpression, formatInDisplayTz, tier0Match } from './logic';
import { nextId, nowIso } from './ids';

const welcome = (): ChatMessage => ({
  id: 'msg-welcome',
  role: 'edith',
  kind: 'notice',
  text: 'Prototype. Nothing here calls a model, microphone, search engine or device. Time, arithmetic, memory answers and task plans are simulated or computed in the browser.',
  at: nowIso(),
  source: 'text',
  simulated: true,
});

const STREAM_MS = 35;

export function createConversationService(deps: {
  tasks: TaskService;
  memory: MemoryService;
  routing: RoutingService;
  diag: DiagnosticsService;
  onReplyComplete: (text: string, source: 'text' | 'voice') => void;
}): ConversationService {
  const store = new Store<ChatMessage[]>([welcome()]);
  let streamHandle: ReturnType<typeof setInterval> | null = null;

  const append = (m: ChatMessage): void => {
    store.set((list) => [...list, m]);
  };

  const streamReply = (text: string, route: ReturnType<typeof buildRoute>, source: 'text' | 'voice', linkedTaskId?: string): void => {
    const id = nextId('msg');
    const words = text.split(/(\s+)/);
    append({ id, role: 'edith', kind: 'text', text: '', at: nowIso(), source, route, streaming: true, linkedTaskId, simulated: true });
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

  const latestTaskId = (): string | undefined => deps.tasks.get()[0]?.id;

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

  const send = (raw: string, source: 'text' | 'voice' = 'text', options: SendOptions = {}): void => {
    const text = raw.trim();
    if (!text) return;
    const mode = options.mode ?? 'auto';
    append({ id: nextId('msg'), role: 'owner', kind: 'text', text, at: nowIso(), source, mode, contextAttached: Boolean(options.attachContext) });

    let intent: TaskIntent = classifyIntent(text);
    if (mode === 'research') intent = 'research';
    if (mode === 'code') intent = 'code';
    const followUp = /\b(continue that|that task|the last task|continue this)\b/i.test(text) ? latestTaskId() : undefined;

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
        `Started a simulated task. Route: ${route.tier} · ${route.model ?? 'no model'}. The plan, tools, approvals and verification are in the Activity panel. Nothing external is touched.`,
        route,
        source,
        followUp,
      );
      return;
    }

    const route = buildRoute(nextId('rt'), nowIso(), 'chat', 0);
    deps.routing.record(route);
    streamReply(
      'No model is connected in this prototype, so there is no real answer to give. The real system would send this to the Tier 2 route shown below. Time, arithmetic, memory questions and task plans do run here.',
      route,
      source,
      followUp,
    );
  };

  const reset = (): void => {
    if (streamHandle) clearInterval(streamHandle);
    streamHandle = null;
    store.set(() => [welcome()]);
  };

  return { get: store.get, subscribe: store.subscribe, send, reset };
}
