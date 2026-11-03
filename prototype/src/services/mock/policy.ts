import { Store } from '../store';
import type { DiagnosticsService, PolicyService, PolicyState } from '../contracts';
import type { PolicyLimits } from '../../types/contracts';
import { seedAudit, seedRules } from '../../data/seed';
import { nextId, nowIso } from './ids';

export const DEFAULT_LIMITS: PolicyLimits = {
  filesPerTask: 5,
  writtenMB: 2,
  processRuns: 20,
  fetches: 12,
  budgetMinutes: 15,
};

const LIMIT_BOUNDS: Record<keyof PolicyLimits, [number, number]> = {
  filesPerTask: [1, 50],
  writtenMB: [1, 100],
  processRuns: [1, 200],
  fetches: [1, 200],
  budgetMinutes: [1, 240],
};

export function createPolicyService(diag: DiagnosticsService): PolicyService {
  const store = new Store<PolicyState>({ rules: seedRules, limits: DEFAULT_LIMITS, audit: seedAudit });

  const setAutonomy: PolicyService['setAutonomy'] = (ruleId, autonomy) => {
    const rule = store.get().rules.find((r) => r.id === ruleId);
    if (!rule) return;
    if (rule.locked) {
      diag.log('policy', 'warn', `rule ${ruleId} is locked by policy; change refused`);
      return;
    }
    store.set((s) => ({
      ...s,
      rules: s.rules.map((r) => (r.id === ruleId ? { ...r, autonomy } : r)),
      audit: [{ id: nextId('au'), at: nowIso(), kind: 'policy.changed', summary: `${rule.group} (${rule.scope}) → ${autonomy}`, decision: 'owner edit (prototype only, not enforced)' }, ...s.audit].slice(0, 50),
    }));
  };

  const setLimit: PolicyService['setLimit'] = (key, value) => {
    const [lo, hi] = LIMIT_BOUNDS[key];
    const clamped = Math.min(hi, Math.max(lo, Math.round(value)));
    store.set((s) => ({ ...s, limits: { ...s.limits, [key]: clamped } }));
  };

  return { get: store.get, subscribe: store.subscribe, setAutonomy, setLimit };
}
