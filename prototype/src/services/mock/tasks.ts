import { Store } from '../store';
import type { DiagnosticsService, NotificationService, TaskService } from '../contracts';
import type {
  ApprovalRequest,
  ChangedFile,
  RouteInfo,
  TaskEvent,
  TaskIntent,
  TaskRecord,
  TaskState,
  TaskSubtask,
  ToolCall,
} from '../../types/contracts';
import { orchestrationOf, planFor, verificationLabel } from './logic';
import { nextId, nowIso } from './ids';
import { evidenceFor } from '../../data/searchBank';

const TICK_MS = 500;
const MAX_PARALLEL = 3;
const PRE_EXECUTION: TaskState[] = ['ContextRetrieval', 'Planning', 'Routing'];
const TERMINAL: TaskState[] = ['Completed', 'Failed', 'Cancelled'];

const PROPOSED_CHANGES: ChangedFile[] = [
  { path: 'src/auth/session.rs', added: 14, removed: 3, status: 'proposed', rollbackAvailable: true },
  { path: 'tests/auth_test.rs', added: 22, removed: 0, status: 'proposed', rollbackAvailable: true },
];

/** Human-readable name for a capability, e.g. "native:fs.read" → "fs.read". */
function toolName(st: TaskSubtask): string {
  return st.kind === 'model' ? `${st.capability.replace('model:', 'model · ')} (${st.tier})` : st.capability.replace(/^native:/, '');
}

/** Short argument summary. Never the raw payload. */
function argsOf(st: TaskSubtask, objective: string): string {
  if (st.capability.includes('search')) return `query: "${objective.slice(0, 36)}${objective.length > 36 ? '…' : ''}"`;
  if (st.capability.includes('fs.read')) return 'project files, read-only';
  if (st.capability.includes('fs.write')) return '2 files, preview approved';
  if (st.capability.includes('run_template')) return 'template: cargo test';
  if (st.capability.includes('git')) return 'repository status';
  if (st.capability.includes('fetch')) return 'top sources, size-limited';
  if (st.capability.includes('memory')) return 'project and episodic scope';
  return `${st.tier} · ${st.kind}`;
}

/**
 * Simulated task executor. It advances tasks through the lifecycle states with timers.
 * It performs NO real work: no files are read or written, no processes run, no network calls are made.
 */
export function createTaskService(deps: { diag: DiagnosticsService; notify: NotificationService }): TaskService {
  const { diag, notify } = deps;
  const tasks = new Store<TaskRecord[]>([]);
  const approvals = new Store<ApprovalRequest[]>([]);
  const timers = new Map<string, ReturnType<typeof setInterval>>();

  const current = (id: string): TaskRecord | undefined => tasks.get().find((t) => t.id === id);
  const patch = (id: string, fn: (t: TaskRecord) => TaskRecord): void => {
    tasks.set((list) => list.map((t) => (t.id === id ? { ...fn({ ...t }), updatedAt: nowIso() } : t)));
  };
  const makeEvent = (kind: string, text: string): TaskEvent => ({ id: nextId('ev'), at: nowIso(), kind, text });
  const withEvent = (t: TaskRecord, kind: string, text: string): TaskRecord => ({ ...t, events: [...t.events, makeEvent(kind, text)] });

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
    const objective = current(id)?.objective ?? 'task';
    patch(id, (t) => withEvent({ ...t, state, outcome, blocker }, 'task.finished', `${outcome}${blocker ? `: ${blocker}` : ''}`));
    diag.log('orchestrator', outcome === 'failed' ? 'warn' : 'info', `task ${id} ${outcome}`, id);
    const short = objective.length > 48 ? `${objective.slice(0, 48)}…` : objective;
    if (outcome === 'completed') notify.push(`Done: ${short}`, 'ok', id);
    else if (outcome === 'failed') notify.push(`Blocked: ${short}`, 'error', id);
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
      preview: 'Modify 2 files: src/auth/session.rs (+14 −3), tests/auth_test.rs (+22 −0). SIMULATED PREVIEW — nothing is written by the prototype.',
      autonomy: 'confirm_required',
      status: 'pending',
    };
    approvals.set((list) => [req, ...list]);
    patch(t.id, (x) => withEvent({ ...x, changedFiles: PROPOSED_CHANGES.map((f) => ({ ...f })) }, 'approval.requested', `${s.label} needs approval (simulated)`));
    notify.push('Approval needed before a file change', 'warn', t.id);
    diag.log('policy', 'info', `approval requested for "${s.label}" (simulated)`, t.id);
  };

  const tick = (id: string): void => {
    const t = current(id);
    if (!t || TERMINAL.includes(t.state)) {
      stop(id);
      return;
    }
    if (t.state === 'Waiting') return;
    if (t.state === 'Recovering') {
      setState(id, 'Executing', 'retrying the failed step (simulated)');
      return;
    }

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
      const failing = t.intent === 'code' && Boolean(blocker);
      const verdicts = t.verdicts.map((v) => ({
        ...v,
        verdict: failing ? ('fail' as const) : ('pass' as const),
        evidence: failing ? 'Patch not applied (simulated blocker)' : 'Simulated only: no real check ran',
      }));
      const evidence = t.intent === 'research' ? evidenceFor(t.objective) : [];
      const unresolved = t.intent === 'research' ? ['Pricing and licence terms of the alternatives were not checked (no source in this prototype).'] : [];
      patch(id, (x) => ({ ...x, verdicts, evidence, unresolved }));
      finish(id, failing ? 'failed' : 'completed', failing ? blocker : undefined);
      return;
    }

    if (t.state !== 'Executing') return;
    const now = nowIso();
    const elapsed = (startedAt: string) => Date.parse(now) - Date.parse(startedAt);

    // A) progress running steps; a step marked failOnce times out once and is retried.
    const finishedIds: string[] = [];
    const timedOut: TaskSubtask[] = [];
    const subtasks = t.subtasks.map((s) => {
      if (s.state !== 'running') return s;
      const remaining = s.remainingTicks - 1;
      if (remaining > 0) return { ...s, remainingTicks: remaining };
      if (s.failOnce && s.attempts === 1) {
        timedOut.push(s);
        return { ...s, remainingTicks: 0, state: 'pending' as const, attempts: 2, failOnce: false, note: 'timed out — retry scheduled (simulated)' };
      }
      finishedIds.push(s.id);
      return { ...s, remainingTicks: 0, state: 'done' as const, finishedAt: now, note: 'ok (simulated)' };
    });
    // Progress is persisted every tick a step is running, not only when a step finishes.
    if (t.subtasks.some((s) => s.state === 'running')) {
      patch(id, (x) => {
        let y: TaskRecord = { ...x, subtasks };
        y.tools = y.tools.map((tc) => {
          if (tc.status !== 'running') return tc;
          if (finishedIds.includes(tc.stepId)) return { ...tc, status: 'ok' as const, durationMs: elapsed(tc.startedAt) };
          if (timedOut.some((s) => s.id === tc.stepId)) return { ...tc, status: 'error' as const, durationMs: elapsed(tc.startedAt) };
          return tc;
        });
        for (const sid of finishedIds) {
          const st = subtasks.find((s) => s.id === sid)!;
          y = withEvent(y, 'subtask.finished', `${st.label} — done (simulated)`);
          if (st.capability === 'native:fs.write') y.changedFiles = y.changedFiles.map((f) => ({ ...f, status: 'applied' as const }));
        }
        for (const st of timedOut) {
          y.errors = [
            ...y.errors,
            { id: nextId('err'), at: now, message: `${st.label}: injected failure for this demo (simulated; no provider was contacted)`, recovery: 'Retrying this step once. If it fails again, the step is skipped and reported.' },
          ];
          y = withEvent(y, 'step.retry', `${st.label} — timed out, retry scheduled (simulated)`);
          y.state = 'Recovering';
        }
        return y;
      });
      if (timedOut.length) {
        diag.log('orchestrator', 'warn', `step timed out; retry scheduled (simulated)`, id);
        return;
      }
    }

    // B) start ready steps, respecting dependencies, parallelism and approvals.
    const latest = current(id);
    if (!latest) return;
    const doneIds = new Set(latest.subtasks.filter((s) => s.state === 'done').map((s) => s.id));
    let running = latest.subtasks.filter((s) => s.state === 'running').length;
    let waiting = false;
    const started: TaskSubtask[] = [];
    const next = latest.subtasks.map((s) => {
      if (s.state !== 'pending' || !s.deps.every((d) => doneIds.has(d))) return s;
      if (s.needsApproval) {
        const existing = approvals.get().find((a) => a.subtaskId === s.id);
        if (!existing) {
          requestApproval(latest, s);
          waiting = true;
          return s;
        }
        if (existing.status === 'pending') {
          waiting = true;
          return s;
        }
        if (existing.status === 'denied') return { ...s, state: 'skipped' as const, note: 'denied by owner (simulated)' };
      }
      if (running >= MAX_PARALLEL) return s;
      running += 1;
      const st = { ...s, state: 'running' as const, attempts: s.attempts, startedAt: now };
      started.push(st);
      return st;
    });
    const cascaded = next.reduce<TaskSubtask[]>((acc, s) => (s.state === 'skipped' && s.note?.includes('denied') ? cascadeSkip(acc, s.id) : acc), next);
    if (started.length) {
      patch(id, (x) => {
        let y: TaskRecord = { ...x, subtasks: cascaded };
        for (const st of started) {
          const call: ToolCall = { id: nextId('tc'), stepId: st.id, name: toolName(st), argsSummary: argsOf(st, latest.objective), status: 'running', startedAt: now, simulated: true };
          y.tools = [...y.tools, call];
          y = withEvent(y, 'subtask.started', `${st.label} — started (${st.tier}, simulated)`);
        }
        return y;
      });
    } else if (cascaded !== latest.subtasks) {
      patch(id, (x) => ({ ...x, subtasks: cascaded }));
    }
    if (waiting) {
      setState(id, 'Waiting', 'approval required (simulated)');
      return;
    }

    // C) completion: every step is done, skipped or failed.
    const after = current(id);
    if (!after) return;
    if (after.subtasks.every((s) => s.state === 'done' || s.state === 'skipped' || s.state === 'failed')) {
      const denied = after.subtasks.find((s) => s.state === 'skipped' && s.note?.includes('denied'));
      if (denied) patch(id, (x) => ({ ...x, blocker: `Owner denied "${denied.label}" (simulated).` }));
      setState(id, 'Verifying', `${verificationLabel(after.verification)} (simulated)`);
    }
  };

  const start = (objective: string, intent: TaskIntent, origin: 'text' | 'voice', route: RouteInfo): string => {
    const plan = planFor(intent);
    const id = nextId('task');
    const subtasks: TaskSubtask[] = plan.subtasks.map((s, i) => ({
      id: `${id}-s${i}`,
      label: s.label,
      capability: s.capability,
      kind: s.kind,
      deps: s.deps.map((j) => `${id}-s${j}`),
      state: 'pending',
      tier: s.tier,
      needsApproval: s.needsApproval,
      failOnce: s.failOnce,
      attempts: 1,
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
      events: [makeEvent('task.created', `Objective received (${origin}, simulated)`)],
      verdicts: plan.criteria.map((c) => ({ criterion: c, verdict: 'pending' as const })),
      tools: [],
      errors: [],
      evidence: [],
      changedFiles: [],
      unresolved: [],
      route,
      orchestration: orchestrationOf(intent, plan),
      simulated: true,
    };
    tasks.set((list) => [record, ...list].slice(0, 30));
    diag.log('orchestrator', 'info', `task created: ${intent} (${plan.subtasks.length} subtasks, simulated)`, id);
    timers.set(id, setInterval(() => tick(id), TICK_MS));
    return id;
  };

  const cancel = (id: string): void => {
    const t = current(id);
    if (!t || TERMINAL.includes(t.state)) return;
    approvals.set((list) => list.map((a) => (a.taskId === id && a.status === 'pending' ? { ...a, status: 'denied' } : a)));
    const now = nowIso();
    patch(id, (x) => {
      const subtasks = x.subtasks.map((s) => (s.state === 'running' || s.state === 'pending' ? { ...s, state: 'skipped' as const, note: 'cancelled (simulated)' } : s));
      const tools = x.tools.map((tc) => (tc.status === 'running' ? { ...tc, status: 'error' as const, durationMs: Date.parse(now) - Date.parse(tc.startedAt) } : tc));
      return withEvent({ ...x, subtasks, tools, state: 'Cancelled', outcome: 'cancelled' }, 'task.cancelled', 'Cancelled by owner (simulated)');
    });
    finish(id, 'cancelled');
  };

  const decide = (approvalId: string, decision: 'approve' | 'deny', scope?: 'once' | 'task' | 'project'): void => {
    const req = approvals.get().find((a) => a.id === approvalId);
    if (!req || req.status !== 'pending') return;
    const decidedAt = nowIso();
    approvals.set((list) => list.map((a) => (a.id === approvalId ? { ...a, status: decision === 'approve' ? 'approved' : 'denied', scope: decision === 'approve' ? scope ?? 'once' : undefined, decidedAt } : a)));
    diag.log('policy', 'info', `approval ${decision === 'approve' ? 'approved' : 'denied'} (scope: ${scope ?? 'n/a'}, simulated)`, req.taskId);
    const t = current(req.taskId);
    if (!t || TERMINAL.includes(t.state)) return;
    if (decision === 'approve') {
      patch(req.taskId, (x) => withEvent({ ...x, state: 'Executing' }, 'approval.resolved', `Owner approved (${scope ?? 'once'} scope, simulated)`));
    } else {
      patch(req.taskId, (x) => {
        const subtasks = cascadeSkip(
          x.subtasks.map((s) => (s.id === req.subtaskId ? { ...s, state: 'skipped' as const, note: 'denied by owner (simulated)' } : s)),
          req.subtaskId,
        );
        const changedFiles = x.changedFiles.map((f) => ({ ...f, status: 'denied' as const }));
        return withEvent({ ...x, subtasks, changedFiles, state: 'Executing', blocker: 'Owner denied the patch (simulated).' }, 'approval.resolved', 'Owner denied the patch (simulated)');
      });
    }
  };

  return {
    get: tasks.get,
    subscribe: tasks.subscribe,
    start,
    cancel,
    approvals: { get: approvals.get, subscribe: approvals.subscribe },
    decide,
  };
}
