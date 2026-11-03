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
