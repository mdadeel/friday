import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApprovalCard } from '../../src/components/ApprovalCard';
import { renderWithServices } from './helpers';
import { createMockServices } from '../../src/services/mock';
import type { RouteInfo } from '../../src/types/contracts';

const route: RouteInfo = { id: 'r', at: '', tier: 'T3', provider: 'ollama', model: 'm', dataClass: 'Personal', locality: 'Local', reason: '', fallbacks: [], latencyMs: 0, category: 'Coding', outcome: 'ok', simulated: true };

/** Starts a code task and advances simulated time until it pauses for approval. */
function pauseForApproval(services: ReturnType<typeof createMockServices>) {
  services.tasks.start('Fix the auth bug', 'code', 'text', route);
  const id = services.tasks.get()[0].id;
  for (let i = 0; i < 200 && services.tasks.get().find((t) => t.id === id)!.state !== 'Waiting'; i++) vi.advanceTimersByTime(500);
  services.tasks.cancel(id);
  return id;
}

describe('approval card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('shows a simulated preview and three approval scopes plus deny', () => {
    const services = createMockServices();
    services.tasks.start('Fix the auth bug', 'code', 'text', route);
    for (let i = 0; i < 60 && services.tasks.approvals.get().length === 0; i++) vi.advanceTimersByTime(500);
    const approval = services.tasks.approvals.get()[0];
    expect(approval).toBeTruthy();
    renderWithServices(<ApprovalCard approval={approval} />, services);
    expect(screen.getByText(/SIMULATED PREVIEW/)).toBeTruthy();
    for (const name of ['Approve once', 'Trust for this task', 'Trust for this project (7 days)', 'Deny']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  test('approve once records the decision with once scope', () => {
    const services = createMockServices();
    services.tasks.start('Fix the auth bug', 'code', 'text', route);
    for (let i = 0; i < 60 && services.tasks.approvals.get().length === 0; i++) vi.advanceTimersByTime(500);
    const approval = services.tasks.approvals.get()[0];
    renderWithServices(<ApprovalCard approval={approval} />, services);
    fireEvent.click(screen.getByRole('button', { name: 'Approve once' }));
    const after = services.tasks.approvals.get().find((a) => a.id === approval.id);
    expect(after?.status).toBe('approved');
    expect(after?.scope).toBe('once');
  });

  test('pausing and cancelling leaves no pending approval for the task', () => {
    const services = createMockServices();
    const id = pauseForApproval(services);
    expect(services.tasks.approvals.get().filter((a) => a.taskId === id && a.status === 'pending')).toHaveLength(0);
  });
});
