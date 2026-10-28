import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readiness, type DayHealth } from './readiness.ts';

const past: DayHealth[] = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, sleepMin: 450 + (i % 3) * 10, restingHr: 55 + (i % 3), hrvMs: 60 + (i % 4) * 2 }));
const today = (o: Partial<DayHealth>): DayHealth => ({ date: '2026-10-25', sleepMin: 460, restingHr: 56, hrvMs: 63, ...o });

test('a usual night and usual heart numbers: normal', () => {
  const r = readiness(today({}), past)!;
  assert.equal(r.label, 'Normal');
  assert.deepEqual(r.reasons, []);
});

test('short sleep and a high resting heart rate: take it easier, and it says why', () => {
  const r = readiness(today({ sleepMin: 300, restingHr: 63, hrvMs: 48 }), past)!;
  assert.equal(r.label, 'Take it easier');
  assert.ok(r.reasons.some((x) => /resting heart rate 7 bpm above usual/.test(x)), r.reasons.join('; '));
  assert.ok(r.reasons.some((x) => /less sleep than usual/.test(x)));
  assert.ok(r.sleep!.score < 70);
});

test('a great night and high HRV: ready to push', () => {
  assert.equal(readiness(today({ sleepMin: 540, restingHr: 52, hrvMs: 75 }), past)!.label, 'Ready to push');
});

test('without your own history, heart numbers are left out, not guessed', () => {
  const r = readiness(today({ sleepMin: null }), past.slice(0, 3));
  assert.equal(r, null);
  const sleepOnly = readiness(today({}), [])!;
  assert.equal(sleepOnly.sleep!.usualMinutes, null, 'sleep is measured against 7½ hours instead');
});
