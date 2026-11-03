import { Store } from '../store';
import type { DiagnosticsService, VoiceService } from '../contracts';
import type { VoiceSnapshot } from '../../types/contracts';

const DEMO_SPEECH = 'what time is it';
const WORD_MS = 260;
const LEVEL_MS = 110;

/**
 * Simulated voice pipeline. It NEVER opens a microphone. "Listening" reveals a canned phrase.
 * Endpointing, barge-in and echo handling are represented as state transitions only.
 */
export function createVoiceService(deps: { diag: DiagnosticsService; onFinal: (text: string) => void }): VoiceService {
  const initial: VoiceSnapshot = {
    state: 'Idle',
    partial: '',
    level: 0,
    device: 'Default input — not opened (prototype)',
    engine: 'whisper_local',
    cloudConsent: false,
    micOpen: false,
    simulated: true,
  };
  const store = new Store<VoiceSnapshot>(initial);
  let timers: ReturnType<typeof setTimeout>[] = [];
  let levelHandle: ReturnType<typeof setInterval> | null = null;
  let wordHandle: ReturnType<typeof setInterval> | null = null;

  const clearAll = (): void => {
    timers.forEach(clearTimeout);
    timers = [];
    if (levelHandle) clearInterval(levelHandle);
    if (wordHandle) clearInterval(wordHandle);
    levelHandle = null;
    wordHandle = null;
  };

  const patch = (p: Partial<VoiceSnapshot>): void => store.set((s) => ({ ...s, ...p }));

  const finalise = (): void => {
    if (levelHandle) clearInterval(levelHandle);
    if (wordHandle) clearInterval(wordHandle);
    levelHandle = null;
    wordHandle = null;
    const text = store.get().partial.trim() || DEMO_SPEECH;
    patch({ state: 'Finalising', micOpen: false, level: 0, partial: text });
    timers.push(
      setTimeout(() => {
        patch({ state: 'Dispatching' });
        deps.diag.log('voice', 'info', `final transcript dispatched (simulated, ${text.split(' ').length} words)`);
        deps.onFinal(text);
        patch({ state: 'Thinking' });
      }, 350),
    );
  };

  const pressToTalk = (): void => {
    const s = store.get().state;
    if (s === 'Listening') return;
    if (s === 'Speaking') {
      bargeIn();
      return;
    }
    clearAll();
    patch({ state: 'Listening', micOpen: true, partial: '', level: 0.2 });
    deps.diag.log('voice', 'info', 'push-to-talk: listening (simulated, no microphone opened)');
    let i = 0;
    const words = DEMO_SPEECH.split(' ');
    wordHandle = setInterval(() => {
      i += 1;
      patch({ partial: words.slice(0, i).join(' ') });
      if (i >= words.length && wordHandle) {
        clearInterval(wordHandle);
        wordHandle = null;
      }
    }, WORD_MS);
    let phase = 0;
    levelHandle = setInterval(() => {
      phase += 1;
      patch({ level: 0.25 + 0.6 * Math.abs(Math.sin(phase / 2)) });
    }, LEVEL_MS);
    // Auto-finalise after the canned phrase plus endpoint silence (700 ms, as a hypothesis in the spec).
    timers.push(setTimeout(() => store.get().state === 'Listening' && finalise(), words.length * WORD_MS + 700));
  };

  const release = (): void => {
    if (store.get().state === 'Listening') finalise();
  };

  function bargeIn(): void {
    if (store.get().state !== 'Speaking') return;
    clearAll();
    patch({ state: 'Interrupted' });
    deps.diag.log('voice', 'warn', 'barge-in: playback stopped (simulated)');
    timers.push(setTimeout(() => pressToTalk(), 120));
  }

  const speak = (text: string): void => {
    clearAll();
    const ms = Math.min(9000, Math.max(1500, text.length * 45));
    patch({ state: 'Speaking', level: 0.5, partial: '' });
    timers.push(
      setTimeout(() => {
        if (store.get().state === 'Speaking') patch({ state: 'Idle', level: 0 });
      }, ms),
    );
  };

  const setEngine = (engine: VoiceSnapshot['engine'], cloudConsent: boolean): void => {
    if (engine === 'gemini_live_cloud' && !cloudConsent) {
      deps.diag.log('voice', 'warn', 'Gemini Live requires cloud consent; engine not changed');
      patch({ cloudConsent: false });
      return;
    }
    patch({ engine, cloudConsent });
    deps.diag.log('voice', 'info', `engine set to ${engine} (simulated)`);
  };

  return {
    get: store.get,
    subscribe: store.subscribe,
    pressToTalk,
    release,
    bargeIn,
    setEngine,
    speak,
  };
}
