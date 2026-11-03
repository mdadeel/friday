import type { VoiceService } from '../contracts';
import type { VoiceSnapshot } from '../../types/contracts';
import { Store } from '../store';
import type { DaemonClient } from './client';

export function createDaemonVoiceService(
  client: DaemonClient,
  options?: { onFinal?: (text: string) => void }
): VoiceService {
  const store = new Store<VoiceSnapshot>({
    state: 'Idle',
    partial: '',
    level: 0,
    device: 'Default Microphone (PipeWire / ALSA)',
    engine: 'whisper_local',
    cloudConsent: false,
    micOpen: false,
    simulated: false,
  });

  // Listen to WebSocket broadcasts from daemon voice manager
  client.onEvent((envelope: any) => {
    if (!envelope || !envelope.topic) return;

    if (envelope.topic === 'voice.state_changed') {
      const nextState = envelope.payload?.state || 'Idle';
      const micOpen = ['Listening', 'Transcribing', 'Finalising', 'Speaking'].includes(nextState);
      store.set((snap) => ({
        ...snap,
        state: nextState as any,
        micOpen,
      }));
    } else if (envelope.topic === 'voice.level_meter') {
      const db = envelope.payload?.db_level || -60;
      // Map dBFS (-60..0) to normalized 0..1
      const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
      store.set((snap) => ({
        ...snap,
        level: normalized,
      }));
    } else if (envelope.topic === 'voice.transcription') {
      const text = envelope.payload?.text || '';
      store.set((snap) => ({
        ...snap,
        partial: text,
      }));
      if (text && options?.onFinal) {
        options.onFinal(text);
      }
    }
  });

  return {
    get: store.get,
    subscribe: store.subscribe,

    async pressToTalk() {
      store.set((snap) => ({ ...snap, state: 'Listening', micOpen: true }));
      try {
        await client.postJson('/v1/voice/start');
      } catch (e) {
        console.warn('[DaemonVoice] Failed to start voice session:', e);
      }
    },

    async release() {
      store.set((snap) => ({ ...snap, micOpen: false }));
      try {
        const res = await client.postJson<{
          result?: { text: string; confidence: number };
          state?: string;
        }>('/v1/voice/stop');

        if (res.result?.text) {
          store.set((snap) => ({
            ...snap,
            partial: res.result!.text,
          }));
          if (options?.onFinal) {
            options.onFinal(res.result.text);
          }
        }
      } catch (e) {
        console.warn('[DaemonVoice] Failed to stop voice session:', e);
      }
    },

    async bargeIn() {
      store.set((snap) => ({ ...snap, state: 'Interrupted', micOpen: false }));
      try {
        await client.postJson('/v1/voice/cancel');
      } catch (e) {
        console.warn('[DaemonVoice] Failed to cancel voice output:', e);
      }
    },

    setEngine(engine, cloudConsent) {
      store.set((snap) => ({ ...snap, engine, cloudConsent }));
    },

    async speak(text: string) {
      store.set((snap) => ({ ...snap, state: 'Speaking' }));
      try {
        await client.postJson('/v1/voice/tts', { text });
      } catch (e) {
        console.warn('[DaemonVoice] TTS synthesis failed:', e);
      } finally {
        store.set((snap) => ({ ...snap, state: 'Idle' }));
      }
    },
  };
}
