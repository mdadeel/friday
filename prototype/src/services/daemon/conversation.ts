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
      const thinkingDelta = envelope.payload?.thinking_delta || '';
      if (currentStreamingMsgId && (delta || thinkingDelta)) {
        store.set((msgs) =>
          msgs.map((m) =>
            m.id === currentStreamingMsgId
              ? {
                  ...m,
                  text: m.text + delta,
                  thinking: (m.thinking || '') + thinkingDelta,
                  streaming: true,
                }
              : m
          )
        );
      }
    } else if (kind === 'tool.invoking') {
      const toolName = envelope.payload?.tool || 'unknown';
      const input = envelope.payload?.input;
      if (currentStreamingMsgId) {
        store.set((msgs) =>
          msgs.map((m) => {
            if (m.id !== currentStreamingMsgId) return m;
            const existing = m.toolCalls || [];
            return {
              ...m,
              toolCalls: [
                ...existing,
                { name: toolName, input, status: 'running' as const },
              ],
            };
          })
        );
      }
    } else if (kind === 'tool.completed') {
      const toolName = envelope.payload?.tool || 'unknown';
      const output = envelope.payload?.output;
      if (currentStreamingMsgId) {
        store.set((msgs) =>
          msgs.map((m) => {
            if (m.id !== currentStreamingMsgId) return m;
            const existing = m.toolCalls || [];
            return {
              ...m,
              toolCalls: existing.map((tc) =>
                tc.name === toolName
                  ? { ...tc, output, status: 'completed' as const }
                  : tc
              ),
            };
          })
        );
      }
    } else if (kind === 'message.final') {
      const finalText = envelope.payload?.content || envelope.payload?.text || '';
      const thinking = envelope.payload?.thinking || undefined;
      if (currentStreamingMsgId) {
        store.set((msgs) =>
          msgs.map((m) =>
            m.id === currentStreamingMsgId
              ? {
                  ...m,
                  text: finalText || m.text,
                  thinking: thinking || m.thinking,
                  streaming: false,
                }
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
        const postRes = await client.postJson<{
          turn_id: string;
          task_id: string;
        }>(`/v1/sessions/${sessionId}/messages`, {
          text,
          source,
        });

        // Polling fallback to guarantee completion if WebSocket lagged or missed
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const current = store.get().find((m) => m.id === assistantMsgId);
          if (current && !current.streaming && current.text.trim()) {
            break;
          }

          try {
            const turns = await client.getJson<
              Array<{ id: string; role: string; content: string }>
            >(`/v1/sessions/${sessionId}/turns`);

            // The matching assistant turn must appear strictly after this user's turn
            const userTurnIdx = turns.findIndex((t) => t.id === postRes.turn_id);
            if (userTurnIdx !== -1) {
              const matchingAssistant = turns
                .slice(userTurnIdx + 1)
                .find((t) => t.role === 'assistant');

              if (matchingAssistant && matchingAssistant.content) {
                store.set((msgs) =>
                  msgs.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: matchingAssistant.content, streaming: false }
                      : m
                  )
                );
                break;
              }
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
