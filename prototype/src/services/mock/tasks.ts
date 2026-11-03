import { Store } from '../store';
import type { TaskService, Observable, DiagnosticsService } from '../contracts';
import type {
  ApprovalRequest,
  RouteInfo,
  TaskEvent,
  TaskIntent,
  TaskRecord,
  TaskState,
  TaskSubtask,
} from '../../types/contracts';
import { planFor, verificationLabel } from './logic';
import { nextId, nowIso } from './ids';

const TICK_MS = 500;
const MAX_PARALLEL = 3;
const PRE_EXECUTION: TaskState[] = ['ContextRetrieval', 'Planning', 'Routing'];
const TERMINAL: TaskState[] = ['Completed', 'Failed', 'Cancelled'];

export interface TaskServiceHandle extends TaskService {
  /** Used by tests and by the Activity screen to show the plan. */
  planPreview(intent: TaskIntent): string[];
}

/**
 * Simulated task executor. It advances a task through the lifecycle states with timers.
 * It performs NO real work: no files are read or written, no processes run, no network calls are made.
 */
export function createTaskService(diag: DiagnosticsService): TaskServiceHandle {
  const tasks = new Store<TaskRecord[]>([]);
  const approvals = new Store<ApprovalRequest[]>([]);
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  const current = (id: string): TaskRecord | undefined => tasks.get().find((t) => t.id === id);

  const patch = (id: string, fn: (t: TaskRecord) => TaskRecord): void => {
    tasks.set((list) => list.map((t) => (t.id === id ? fn({ ...t, updatedAt: nowIso() }) : t)));
  };

  const withEvent = (t: TaskRecord, kind: string, text: string): TaskRecord => {
    const ev: TaskEvent = { id: nextId('ev'), at: nowIso(), kind, text };
    return { ...t, events: [...t.events, ev] };
  };

  const setState = (id: string, state: TaskState, text: string): void => {
    patch(id, (t) => withEvent({ ...t, state }, 'state_changed', `${state}: ${text}`));
    diag.log('orchestrator', 'debug', `task ${id} → ${state}`, id);
  };

  const stop = (id: string): void => {
    const handle = timers.get(id);
    if (handle) clearInterval(handle);
    timers.delete(id);
  };

  const finish = (id: string, outcome: 'completed' | 'failed' | 'cancelled', blocker?: string): void => {
    stop(id);
    const state: TaskState = outcome === 'completed' ? 'Completed' : outcome === 'failed' ? 'Failed' : 'Cancelled';
    patch(id, (t) => withEvent({ ...t, state, outcome, blocker }, 'task.finished', `${outcome}${blocker ? `: ${blocker}` : ''}`));
    diag.log('orchestrator', outcome === 'failed' ? 'warn' : 'info', `task ${id} ${outcome}`, id);
  };

  const cascadeSkip = (subtasks: TaskSubtask[], skippedId: string): TaskSubtask[] => {
    let changed = true;
    let result = subtasks;
    const skipped = new Set<string>([skippedId]);
    while (changed) {
      changed = false;
      result = result.map((s) => {
        if (s.state === 'pending' && s.deps.some((d) => skipped.has(d))) {
          skipped.add(s.id);
          changed = true;
          return { ...s, state: 'skipped' as const, note: 'skipped: dependency not satisfied (simulated)' };
        }
        return s;
      });
    }
    return result;
  };

  const requestApproval = (t: TaskRecord, s: TaskSubtask): void => {
    const req: ApprovalRequest = {
      id: nextId('appr'),
      taskId: t.id,
      subtaskId: s.id,
      capability: s.capability,
      preview:
        'Modify 2 files: src/auth/session.rs (+14 −3), tests/auth_test.rs (+22 −0). ' +
        'SIMULATED PREVIEW — nothing is written by the prototype.',
      autonomy: 'confirm_required',
      status: 'pending',
    };
    approvals.set((list) => [req, ...list]);
    diag.log('policy', 'info', `approval requested for "${s.label}" (simulated)`, t.id);
  };

  const tick = (id: string): void => {
    const t = current(id);
    if (!t || TERMINAL.includes(t.state)) {
      stop(id);
      return;
    }
    if (t.state === 'Waiting') return;

    const phaseIndex = PRE_EXECUTION.indexOf(t.state);
    if (phaseIndex >= 0 && phaseIndex < PRE_EXECUTION.length - 1) {
      setState(id, PRE_EXECUTION[phaseIndex + 1], 'advancing (simulated)');
      return;
    }
    if (t.state === 'Understanding') {
      setState(id, 'ContextRetrieval', 'retrieving context (simulated)');
      return;
    }
    if (t.state === 'Routing') {
      setState(id, 'Executing', 'routes assigned (simulated)');
      return;
    }

    if (t.state === 'Verifying') {
      const blocker = t.blocker;
      const verdicts = t.verdicts.map((v) => ({
        ...v,
        verdict: blocker && t.intent === 'code' ? ('fail' as const) : ('pass' as const),
        evidence: blocker && t.intent === 'code' ? 'Patch not applied — see blocker' : 'Simulated check passed',
      }));
      patch(id, (x) => ({ ...x, verdicts }));
      const failed = verdicts.some((v) => v.verdict === 'fail');
      finish(id, failed ? 'failed' : 'completed', failed ? blocker : undefined);
      return;
    }

    if (t.state === 'Executing' || t.state === 'Recovering') {
      // 1) progress running subtasks
      let subtasks = t.subtasks.map((s) => {
        if (s.state !== 'running') return s;
        const remaining = s.remainingTicks - 1;
        if (remaining > 0) return { ...s, remainingTicks: remaining };
        return { ...s, remainingTicks: 0, state: 'done' as const, note: 'ok (simulated)' };
      });
      const finishedNow = subtasks.filter((s, i) => s.state === 'done' && t.subtasks[i].state === 'running');
      patch(id, (x) => {
        let y = { ...x, subtasks };
        finishedNow.forEach((s) => {
          y = withEvent(y, 'subtask.finished', `${s.label} — done (simulated)`);
        });
        return y;
      });

      // 2) start ready subtasks, respecting dependencies, parallelism and approvals
      const latest = current(id);
      if (!latest) return;
      subtasks = latest.subtasks;
      const doneIds = new Set(subtasks.filter((s) => s.state === 'done').map((s) => s.id));
      let running = subtasks.filter((s) => s.state === 'running').length;
      let waitingForApproval = false;
      const next = subtasks.map((s) => {
        if (s.state !== 'pending' || !s.deps.every((d) => doneIds.has(d))) return s;
        if (s.needsApproval) {
          const existing = approvals.get().find((a) => a.subtaskId === s.id);
          if (!existing) {
            requestApproval(latest, s);
            waitingForApproval = true;
            return s;
          }
          if (existing.status === 'pending') {
            waitingForApproval = true;
            return s;
          }
          if (existing.status === 'denied') {
            return { ...s, state: 'skipped' as const, note: 'denied by owner (simulated)' };
          }
        }
        if (running >= MAX_PARALLEL) return s;
        running += 1;
        return { ...s, state: 'running' as const, remainingTicks: s.remainingTicks };
      });
      const cascaded = next.reduce<TaskSubtask[]>((acc, s) => (s.state === 'skipped' && s.note?.includes('denied') ? cascadeSkip(acc, s.id) : acc), next);
      const startedNow = cascaded.filter((s, i) => s.state === 'running' && latest.subtasks[i]?.state === 'pending');
      patch(id, (x) => {
        let y = { ...x, subtasks: cascaded };
        startedNow.forEach((s) => {
          y = withEvent(y, 'subtask.started', `${s.label} — started (${s.tier}, simulated)`);
        });
        return y;
      });
      if (waitingForApproval) {
        const denied = approvals.get().find((a) => a.taskId === id && a.status === 'denied');
        if (!denied) {
          setState(id, 'Waiting', 'approval required (simulated)');
          return;
        }
      }

      // 3) completion of the plan
      const after = current(id);
      if (!after) return;
      const allTerminal = after.subtasks.every((s) => s.state === 'done' || s.state === 'skipped' || s.state === 'failed');
      if (allTerminal) {
        const deniedStep = after.subtasks.find((s) => s.state === 'skipped' && s.note?.includes('denied'));
        if (deniedStep) {
          patch(id, (x) => ({ ...x, blocker: `Owner denied "${deniedStep.label}" (simulated).` }));
        }
        setState(id, 'Verifying', `${verificationLabel(after.verification)} (simulated)`);
      }
    }
  };

  const start = (objective: string, intent: TaskIntent, origin: 'text' | 'voice', route: RouteInfo): string => {
    const plan = planFor(intent);
    const id = nextId('task');
    const subtasks: TaskSubtask[] = plan.subtasks.map((s, i) => ({
      id: `${id}-s${i}`,
      label: s.label,
      capability: s.capability,
      deps: s.deps.map((j) => `${id}-s${j}`),
      state: 'pending',
      tier: s.tier,
      needsApproval: s.needsApproval,
      remainingTicks: s.ticks,
    }));
    const record: TaskRecord = {
      id,
      objective,
      intent,
      origin,
      state: 'Understanding',
      verification: plan.verification,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      subtasks,
      events: [{ id: nextId('ev'), at: nowIso(), kind: 'task.created', text: `Objective received (${origin}, simulated)` }],
      verdicts: plan.criteria.map((c) => ({ criterion: c, verdict: 'pending' as const })),
      route,
      simulated: true,
    };
    tasks.set((list) => [record, ...list].slice(0, 30));
    diag.log('orchestrator', 'info', `task created: ${intent} (${plan.subtasks.length} subtasks, simulated)`, id);
    const handle = setInterval(() => tick(id), TICK_MS);
    timers.set(id, handle);
    return id;
  };

  const cancel = (id: string): void => {
    const t = current(id);
    if (!t || TERMINAL.includes(t.state)) return;
    approvals.set((list) => list.map((a) => (a.taskId === id && a.status === 'pending' ? { ...a, status: 'denied' } : a)));
    patch(id, (x) => {
      const subtasks = x.subtasks.map((s) => (s.state === 'running' || s.state === 'pending' ? { ...s, state: 'skipped' as const, note: 'cancelled (simulated)' } : s));
      return withEvent({ ...x, subtasks, state: 'Cancelled', outcome: 'cancelled' }, 'task.cancelled', 'Cancelled by owner (simulated)');
    });
    finish(id, 'cancelled');
  };

  const decide = (approvalId: string, decision: 'approve' | 'deny'): void => {
    const req = approvals.get().find((a) => a.id === approvalId);
    if (!req || req.status !== 'pending') return;
    approvals.set((list) => list.map((a) => (a.id === approvalId ? { ...a, status: decision === 'approve' ? 'approved' : 'denied' } : a)));
    diag.log('policy', 'info', `approval ${decision}d (simulated)`, req.taskId);
    const t = current(req.taskId);
    if (!t) return;
    if (decision === 'approve') {
      patch(req.taskId, (x) => withEvent({ ...x, state: 'Executing' }, 'approval.resolved', 'Owner approved (simulated)'));
    } else {
      patch(req.taskId, (x) => {
        const subtasks = cascadeSkip(
          x.subtasks.map((s) => (s.id === req.subtaskId ? { ...s, state: 'skipped' as const, note: 'denied by owner (simulated)' } : s)),
          req.subtaskId,
        );
        return withEvent(
          { ...x, subtasks, state: 'Executing', blocker: 'Owner denied the patch (simulated).' },
          'approval.resolved',
          'Owner denied the patch (simulated)',
        );
      });
    }
  };

  const planPreview = (intent: TaskIntent): string[] => planFor(intent).subtasks.map((s) => s.label);

  const taskObs: Observable<TaskRecord[]> = { get: tasks.get, subscribe: tasks.subscribe };
  const approvalObs: Observable<ApprovalRequest[]> = { get: approvals.get, subscribe: approvals.subscribe };

  return {
    get: taskObs.get,
    subscribe: taskObs.subscribe,
    start,
    cancel,
    approvals: approvalObs,
    decide,
    planPreview,
  };
}
