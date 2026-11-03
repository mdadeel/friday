// Derives the overlay core state from the live services. Pure function so it can be unit tested.
import type { TaskRecord, VoiceSnapshot } from '../types/contracts';
import type { CoreState } from '../components/Core';
import { isActive } from './presentation';

export function deriveCoreState(voice: Pick<VoiceSnapshot, 'state'>, tasks: TaskRecord[]): CoreState {
  // The most recent task decides the error state: a blocked task shows the amber ring until the next task starts.
  const latest = tasks[0];
  if (latest && latest.outcome === 'failed') return 'error';
  if (voice.state === 'Listening' || voice.state === 'Finalising' || voice.state === 'Transcribing') return 'listening';
  if (voice.state === 'Speaking') return 'speaking';
  if (tasks.some((t) => isActive(t.state))) return 'thinking';
  return 'idle';
}
