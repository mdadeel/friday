import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tier0Match, evaluateExpression, classifyIntent, answerWhoAmI, planFor, formatInDisplayTz } from '../src/services/mock/logic.ts';
import type { MemoryItem } from '../src/types/contracts.ts';

test('tier 0 matches time, date and arithmetic without a model', () => {
  assert.deepEqual(tier0Match('What time is it?'), { intent: 'time' });
  assert.deepEqual(tier0Match("What's the date today"), { intent: 'date' });
  assert.deepEqual(tier0Match('what is 2 + 3 * 4'), { intent: 'calc', expr: '2 + 3 * 4' });
  assert.equal(tier0Match('research the best architecture'), null);
});

test('calculator evaluates precedence, parentheses and power, and rejects bad input', () => {
  assert.equal(evaluateExpression('2+3*4'), 14);
  assert.equal(evaluateExpression('(2+3)*4'), 20);
  assert.equal(evaluateExpression('2^3^2'), 512);
  assert.equal(evaluateExpression('-3+5'), 2);
  assert.throws(() => evaluateExpression('2 3'));
  assert.throws(() => evaluateExpression('1/0'));
  assert.throws(() => evaluateExpression('process.exit()'));
});

test('intent classification routes objectives to the right plan families', () => {
  assert.equal(classifyIntent('Who am I?'), 'personal');
  assert.equal(classifyIntent('Research the best architecture for this app'), 'research');
  assert.equal(classifyIntent('Inspect my repository and fix the authentication issue'), 'code');
  assert.equal(classifyIntent('Continue what I was doing yesterday'), 'continue');
  assert.equal(classifyIntent('hello there'), 'chat');
});

const mem = (over: Partial<MemoryItem>): MemoryItem => ({
  id: 'm', category: 'semantic', content: 'x', provenance: 'explicit', confidence: 0.9,
  importance: 0.5, userConfirmed: false, status: 'active', sources: [], createdAt: '', updatedAt: '',
  version: 1, simulated: true, ...over,
});

test('who-am-I never uses inferred or assumed items', () => {
  const items = [
    mem({ id: 'a', content: 'Timezone is Asia/Dhaka.' }),
    mem({ id: 'b', content: 'Prefers concise answers.', provenance: 'inferred' }),
    mem({ id: 'c', content: 'Uses Electron.', provenance: 'outdated', status: 'superseded' }),
    mem({ id: 'd', content: 'Likes Rust.', provenance: 'inferred', userConfirmed: true }),
  ];
  const r = answerWhoAmI(items);
  assert.deepEqual(r.usedIds, ['a', 'd']);
  assert.ok(!r.text.includes('concise'));
  assert.ok(!r.text.includes('Electron'));
});

test('who-am-I with no confirmed facts says so', () => {
  const r = answerWhoAmI([mem({ provenance: 'inferred' })]);
  assert.deepEqual(r.usedIds, []);
  assert.match(r.text, /do not have confirmed information/);
});

test('research plan has parallel independent searches and dependent reading', () => {
  const p = planFor('research');
  assert.deepEqual(p.subtasks[1].deps, []);
  assert.deepEqual(p.subtasks[2].deps, []);
  assert.deepEqual(p.subtasks[3].deps, [1, 2]);
  assert.equal(p.verification, 'evidence');
});

test('display timezone formatting uses Asia/Dhaka', () => {
  // 2026-11-03T00:00:00Z is 06:00 in Asia/Dhaka (UTC+6).
  assert.equal(formatInDisplayTz(new Date('2026-11-03T00:00:00Z'), 'time'), '06:00');
});

test('orchestration is derived from the plan: direct, deterministic or dag', async () => {
  const { orchestrationOf } = await import('../src/services/mock/logic.ts');
  const det = orchestrationOf('time', planFor('time'));
  assert.equal(det.pattern, 'deterministic');
  assert.equal(det.steps, 1);
  const chat = orchestrationOf('chat', planFor('chat'));
  assert.equal(chat.pattern, 'direct');
  assert.equal(chat.maxParallel, 1);
  const research = orchestrationOf('research', planFor('research'));
  assert.equal(research.pattern, 'dag');
  assert.equal(research.steps, 8);
  // Steps 1 and 2 have no dependencies and run together; the widest level is 3 (steps 0, 1, 2).
  assert.equal(research.maxParallel, 3);
  const code = orchestrationOf('code', planFor('code'));
  assert.equal(code.approvalGates, 1);
});

test('model routes are decisions only: nothing executes in the browser unless Tier 0', async () => {
  const { buildRoute } = await import('../src/services/mock/logic.ts');
  assert.equal(buildRoute('a', '', 'time').executedBy, 'browser');
  const r = buildRoute('b', '', 'chat');
  assert.equal(r.executedBy, 'none');
  assert.equal(r.model, 'qwen3:8b');
  assert.equal(buildRoute('c', '', 'research').model, 'qwen3:32b');
});
