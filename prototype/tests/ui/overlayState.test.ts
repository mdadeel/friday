import { describe, expect, test } from 'vitest';
import { deriveCoreState } from '../../src/app/overlayState';
import type { TaskRecord } from '../../src/types/contracts';

const task = (over: Partial<TaskRecord>): TaskRecord =>
  ({
    id: 't',
    objective: 'x',
    intent: 'research',
    origin: 'text',
    state: 'Executing',
    verification: 'evidence',
    createdAt: '',
    updatedAt: '',
    subtasks: [],
    events: [],
    verdicts: [],
    tools: [],
    errors: [],
    evidence: [],
    changedFiles: [],
    unresolved: [],
    simulated: true,
    ...over,
  }) as TaskRecord;

describe('deriveCoreState', () => {
  test('idle when nothing runs', () => {
    expect(deriveCoreState({ state: 'Idle' }, [])).toBe('idle');
  });
  test('listening while the microphone is in a listening phase', () => {
    expect(deriveCoreState({ state: 'Listening' }, [])).toBe('listening');
    expect(deriveCoreState({ state: 'Finalising' }, [])).toBe('listening');
  });
  test('speaking when playback runs', () => {
    expect(deriveCoreState({ state: 'Speaking' }, [])).toBe('speaking');
  });
  test('thinking while any task is active', () => {
    expect(deriveCoreState({ state: 'Idle' }, [task({ state: 'Waiting' })])).toBe('thinking');
  });
  test('error when the most recent task was blocked, even if another task is active', () => {
    const latest = task({ state: 'Failed', outcome: 'failed' });
    expect(deriveCoreState({ state: 'Idle' }, [latest, task({ state: 'Executing' })])).toBe('error');
  });
  test('idle once a completed task is the latest', () => {
    expect(deriveCoreState({ state: 'Idle' }, [task({ state: 'Completed', outcome: 'completed' })])).toBe('idle');
  });
});
