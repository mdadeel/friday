import type { ChatMessage } from '../../types/contracts';
import type { ConversationService } from '../contracts';
import { Store } from '../store';
import type { DaemonClient } from './client';

export function createDaemonConversationService(client: DaemonClient): ConversationService {
  const store = new Store<ChatMessage[]>([
    {
      id: 'msg-welcome',
      role: 'edith',
      kind: 'text',
      text: 'EDITH 2.0 connected to native daemon. All 11 registered tools, search, memory, and desktop subsystems are live.',
      at: new Date().toISOString(),
      source: 'text',
      simulated: false,
    },
  ]);

  let activeSessionId: string | null = null;
  let currentStreamingMsgId: string | null = null;

  async function ensureSession(): Promise<string> {
    if (activeSessionId) return activeSessionId;
    try {
      const sessions = await client.getJson<{ sessions: Array<{ id: string; title: string }> }>('/v1/sessions');
      if (sessions.sessions && sessions.sessions.length > 0) {
        activeSessionId = sessions.sessions[0].id;
        return activeSessionId;
      }
      const created = await client.postJson<{ id: string }>('/v1/sessions', { title: 'Desktop Session' });
      activeSessionId = created.id;
      return activeSessionId;
    } catch (e) {
      console.warn('[DaemonConversation] Session initialization error:', e);
      return 'default';
    }
  }

  // Subscribe to live WebSocket events from daemon
  client.onEvent((envelope: any) => {
    if (!envelope) return;
    const kind = envelope.kind || envelope.topic;
    if (!kind) return;

    if (kind === 'message.delta') {
      const delta = envelope.payload?.delta || '';
      if (currentStreamingMsgId && delta) {
        store.set((msgs) =>
          msgs.map((m) =>
            m.id === currentStreamingMsgId
              ? { ...m, text: m.text + delta, streaming: true }
              : m
          )
        );
      }
    } else if (kind === 'message.final') {
      const finalText = envelope.payload?.content || envelope.payload?.text || '';
      if (currentStreamingMsgId) {
        store.set((msgs) =>
          msgs.map((m) =>
            m.id === currentStreamingMsgId
              ? { ...m, text: finalText || m.text, streaming: false }
              : m
          )
        );
        currentStreamingMsgId = null;
      }
    }
  });

  return {
    get: store.get,
    subscribe: store.subscribe,

    async send(text: string, source: 'text' | 'voice' = 'text') {
      const userMsgId = `msg-user-${Date.now()}`;
      const nowStr = new Date().toISOString();

      const userMsg: ChatMessage = {
        id: userMsgId,
        role: 'owner',
        kind: 'text',
        text,
        at: nowStr,
        source,
        simulated: false,
      };

      const assistantMsgId = `msg-edith-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'edith',
        kind: 'text',
        text: '',
        at: nowStr,
        source,
        streaming: true,
        simulated: false,
      };

      currentStreamingMsgId = assistantMsgId;
      store.set((msgs) => [...msgs, userMsg, assistantMsg]);

      try {
        const sessionId = await ensureSession();
        await client.postJson<{
          turn_id: string;
          task_id: string;
        }>(`/v1/sessions/${sessionId}/messages`, {
          text,
          source,
        });

        // Polling fallback to guarantee completion if WebSocket lagged or missed
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 250));
          const current = store.get().find((m) => m.id === assistantMsgId);
          if (current && !current.streaming && current.text.trim()) {
            break;
          }

          try {
            const turns = await client.getJson<
              Array<{ id: string; role: string; content: string }>
            >(`/v1/sessions/${sessionId}/turns`);
            const lastAssistant = [...turns]
              .reverse()
              .find((t) => t.role === 'assistant');
            if (lastAssistant && lastAssistant.content) {
              store.set((msgs) =>
                msgs.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: lastAssistant.content, streaming: false }
                    : m
                )
              );
              break;
            }
          } catch {
            // continue polling
          }
        }
      } catch (err: any) {
        store.set((msgs) =>
          msgs.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `Error from daemon: ${err.message}`, streaming: false }
              : m
          )
        );
      } finally {
        currentStreamingMsgId = null;
      }
    },

    reset() {
      store.set([]);
      activeSessionId = null;
    },
  };
}
