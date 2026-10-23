import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatedOneRepMax, findRecords, formatWeight, incrementKg, nextTarget, toKg, type SetEntry } from './training.ts';

const set = (weightKg: number | null, reps: number | null, extra: Partial<SetEntry> = {}): SetEntry => ({ weightKg, reps, seconds: null, rpe: null, warmup: false, done: true, ...extra });
const lb = (v: number) => toKg(v, 'lb');

test('pounds survive the round trip through kilograms', () => {
  for (const v of [45, 135, 137.5, 225, 315, 405]) assert.equal(formatWeight(lb(v), 'lb'), String(v));
  assert.equal(formatWeight(100, 'kg'), '100');
});

test('steps are 5 or 10 lb, 2.5 or 5 kg', () => {
  assert.equal(formatWeight(incrementKg('small', 'lb'), 'lb'), '5');
  assert.equal(formatWeight(incrementKg('large', 'lb'), 'lb'), '10');
  assert.equal(incrementKg('small', 'kg'), 2.5);
});

test('estimated 1RM is only trusted up to 12 reps', () => {
  assert.equal(estimatedOneRepMax(100, 1), 100);
  assert.equal(Math.round(estimatedOneRepMax(100, 5)!), 117);
  assert.equal(estimatedOneRepMax(100, 15), null);
});

test('double progression adds one step only when every set hits the top', () => {
  const step = incrementKg('small', 'lb');
  const up = nextTarget([set(lb(135), 8), set(lb(135), 8), set(lb(135), 8)], 5, 8, step, 'weight')!;
  assert.equal(formatWeight(up.weightKg, 'lb'), '140');
  assert.equal(up.reps, 5);

  const stay = nextTarget([set(lb(135), 8), set(lb(135), 7), set(lb(135), 6)], 5, 8, step, 'weight')!;
  assert.equal(formatWeight(stay.weightKg, 'lb'), '135');
  assert.equal(stay.reps, 7);
});

test('warm-ups and unfinished sets do not count toward progression', () => {
  const t = nextTarget([set(lb(95), 8, { warmup: true }), set(lb(135), 8), set(lb(135), 8, { done: false })], 5, 8, lb(5), 'weight')!;
  assert.equal(formatWeight(t.weightKg, 'lb'), '140');
});

test('an all-out set holds the weight', () => {
  const t = nextTarget([set(lb(135), 8, { rpe: 10 })], 5, 8, lb(5), 'weight')!;
  assert.equal(formatWeight(t.weightKg, 'lb'), '135');
});

test('records: a first session is a baseline, then only real improvements count', () => {
  const ex = { id: 'x', name: 'Bench press', kind: 'weight' as const };
  assert.deepEqual(findRecords(ex, [set(lb(135), 5)], [], '2026-10-23'), []);
  const prs = findRecords(ex, [set(lb(145), 3)], [set(lb(135), 8)], '2026-10-23');
  assert.deepEqual(prs.map((p) => p.kind), ['weight']);
  // the same weight again, re-entered in pounds, is not a record
  assert.deepEqual(findRecords(ex, [set(lb(135), 8)], [set(lb(135), 8)], '2026-10-23'), []);
  // more reps at the same weight: better estimated max and volume
  assert.deepEqual(findRecords(ex, [set(lb(135), 10)], [set(lb(135), 8)], '2026-10-23').map((p) => p.kind), ['e1rm', 'volume']);
});
