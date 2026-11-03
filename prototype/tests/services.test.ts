// Service-level tests. Bundled with esbuild (see package.json "test") because the service
// modules use extensionless imports. Uses Node's mock timers, so no real waiting.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createMockServices } from '../src/services/mock/index';

function runUntil(ctx: { mock: { timers: { tick(ms: number): void } } }, pred: () => boolean, maxTicks = 200): void {
  for (let i = 0; i < maxTicks && !pred(); i++) ctx.mock.timers.tick(500);
}

test('Tier 0 answers locally and records a T0 route with no model', () => {
  const s = createMockServices();
  s.conversation.send('what is 2 + 3 * 4');
  const last = s.conversation.get().at(-1)!;
  assert.equal(last.role, 'edith');
  assert.equal(last.route?.tier, 'T0');
  assert.equal(last.route?.model, null);
});

test('calculator errors are reported, not thrown', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const s = createMockServices();
  s.conversation.send('what is 1 / 0');
  runUntil(t, () => !s.conversation.get().at(-1)!.streaming);
  const last = s.conversation.get().at(-1)!;
  assert.match(last.text, /could not evaluate that: division by zero/);
});

test('who-am-I uses only explicit or confirmed memory', () => {
  const s = createMockServices();
  s.conversation.send('Who am I?');
  const last = s.conversation.get().at(-1)!;
  assert.ok(!last.text.includes('prefers short'), 'inferred item must not be used');
});

test('confirming a memory supersedes its conflicting item', () => {
  const s = createMockServices();
  s.memory.confirm('mem-08');
  const mem = s.memory.get();
  assert.equal(mem.find((m) => m.id === 'mem-07')?.status, 'superseded');
  assert.equal(mem.find((m) => m.id === 'mem-08')?.userConfirmed, true);
});

test('settings reject nothing and persist only in memory', () => {
  const s = createMockServices();
  s.settings.set('appearance', 'theme', 'light');
  assert.equal(s.settings.get().appearance.theme, 'light');
  s.settings.reset();
  assert.equal(s.settings.get().appearance.theme, 'dark');
});

test('locked policy rules cannot be changed', () => {
  const s = createMockServices();
  const before = s.policy.get().rules.find((r) => r.id === 'r-write-else')!;
  s.policy.setAutonomy('r-write-else', 'automatic');
  const after = s.policy.get().rules.find((r) => r.id === 'r-write-else')!;
  assert.equal(before.autonomy, 'blocked');
  assert.equal(after.autonomy, 'blocked');
});

test('policy limits are clamped to bounds', () => {
  const s = createMockServices();
  s.policy.setLimit('filesPerTask', 9999);
  assert.equal(s.policy.get().limits.filesPerTask, 50);
});

test('research task completes after simulated steps with evidence verdicts', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const s = createMockServices();
  s.conversation.send('Research the best architecture for our MCP host');
  const id = s.tasks.get()[0].id;
  runUntil(t, () => s.tasks.get().find((x) => x.id === id)!.state === 'Completed');
  const task = s.tasks.get().find((x) => x.id === id)!;
  assert.equal(task.state, 'Completed');
  assert.equal(task.outcome, 'completed');
  assert.ok(task.subtasks.every((x) => x.state === 'done'));
  assert.ok(task.verdicts.every((v) => v.verdict === 'pass'));
});

test('code task waits for approval; denial fails it and skips dependent steps', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const s = createMockServices();
  s.conversation.send('Fix the authentication bug in my repo');
  const id = s.tasks.get()[0].id;
  runUntil(t, () => s.tasks.get().find((x) => x.id === id)!.state === 'Waiting');
  assert.equal(s.tasks.get().find((x) => x.id === id)!.state, 'Waiting');
  const approval = s.tasks.approvals.get().find((a) => a.taskId === id && a.status === 'pending')!;
  assert.ok(approval, 'an approval request exists');
  s.tasks.decide(approval.id, 'deny');
  runUntil(t, () => s.tasks.get().find((x) => x.id === id)!.state === 'Failed');
  const task = s.tasks.get().find((x) => x.id === id)!;
  assert.equal(task.outcome, 'failed');
  assert.ok(task.subtasks.some((x) => x.state === 'skipped'));
  assert.ok(task.verdicts.some((v) => v.verdict === 'fail'));
});

test('code task completes after approval', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const s = createMockServices();
  s.conversation.send('Fix the authentication bug in my repo');
  const id = s.tasks.get()[0].id;
  runUntil(t, () => s.tasks.get().find((x) => x.id === id)!.state === 'Waiting');
  const approval = s.tasks.approvals.get().find((a) => a.taskId === id)!;
  s.tasks.decide(approval.id, 'approve');
  runUntil(t, () => s.tasks.get().find((x) => x.id === id)!.state === 'Completed');
  assert.equal(s.tasks.get().find((x) => x.id === id)!.outcome, 'completed');
});

test('cancelling a task denies its pending approvals', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const s = createMockServices();
  s.conversation.send('Fix the authentication bug in my repo');
  const id = s.tasks.get()[0].id;
  runUntil(t, () => s.tasks.get().find((x) => x.id === id)!.state === 'Waiting');
  s.tasks.cancel(id);
  assert.equal(s.tasks.get().find((x) => x.id === id)!.state, 'Cancelled');
  assert.ok(s.tasks.approvals.get().every((a) => a.taskId !== id || a.status !== 'pending'));
});

test('voice never reports microphone open outside Listening', () => {
  const s = createMockServices();
  assert.equal(s.voice.get().micOpen, false);
  s.voice.setEngine('gemini_live_cloud', false);
  assert.equal(s.voice.get().engine, 'whisper_local', 'cloud engine refused without consent');
});

test('no seeded activity: routing counts start at zero and no model is called', () => {
  const s = createMockServices();
  const r = s.routing.get();
  assert.equal(r.sessionRequests, 0);
  assert.equal(r.modelCalls, 0);
  assert.equal(r.recent.length, 0);
  assert.equal(r.events.length, 0);
});

test('probing a provider reports unknown with a reason and never reports up', () => {
  const s = createMockServices();
  s.routing.probe('ollama');
  const p = s.routing.get().providers.find((x) => x.id === 'ollama')!;
  assert.equal(p.health, 'unknown');
  assert.match(p.reason, /no provider client/i);
  assert.ok(p.lastProbe);
});

test('enabling an MCP server never reports it ready: it is not started', () => {
  const s = createMockServices();
  s.capabilities.setServerEnabled('project-files', true);
  const srv = s.capabilities.get().servers.find((x) => x.id === 'project-files')!;
  assert.notEqual(srv.state, 'ready');
  assert.equal(srv.state, 'unavailable');
  assert.match(srv.reason ?? '', /not started/i);
});

test('a research task records orchestration and the evidence it cites', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const s = createMockServices();
  s.conversation.send('research the best architecture for an MCP host');
  const task = s.tasks.get()[0];
  assert.equal(task.orchestration.pattern, 'dag');
  assert.equal(task.orchestration.maxParallel, 3);
  runUntil(t, () => s.tasks.get()[0].outcome !== undefined);
  const done = s.tasks.get()[0];
  assert.ok(done.evidence.length > 0);
  for (const e of done.evidence) assert.ok(e.checkedOn, 'every source has a check date');
});
