import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastProgress, fastStreak, hoursText, type Fast } from './fasting.ts';

const at = (iso: string) => Date.parse(iso);

test('progress toward the goal', () => {
  const f = { startedAt: '2026-10-24T20:00:00Z', endedAt: null, targetHours: 16 };
  const p = fastProgress(f, at('2026-10-25T08:00:00Z'));
  assert.equal(p.hours, 12);
  assert.equal(p.fraction, 0.75);
  assert.equal(p.done, false);
  assert.equal(p.remainingMinutes, 240);
  assert.equal(fastProgress(f, at('2026-10-25T12:30:00Z')).done, true);
  assert.equal(hoursText(16.5), '16h 30m');
});

test('a streak of fasts that reached their goal', () => {
  const fast = (id: string, start: string, end: string | null, h = 16): Fast => ({ id, startedAt: start, endedAt: end, targetHours: h });
  const list = [
    fast('a', '2026-10-22T20:00:00Z', '2026-10-23T13:00:00Z'),
    fast('b', '2026-10-23T20:00:00Z', '2026-10-24T13:00:00Z'),
    fast('c', '2026-10-24T20:00:00Z', null),
  ];
  assert.equal(fastStreak(list, '2026-10-25', 0), 2, 'today still going: yesterday and the day before count');
  assert.equal(fastStreak([...list, fast('d', '2026-10-21T20:00:00Z', '2026-10-22T05:00:00Z')], '2026-10-25', 0), 2, 'a short one does not add');
  assert.equal(fastStreak(list, '2026-10-27', 0), 0, 'a missed day ends it');
});
