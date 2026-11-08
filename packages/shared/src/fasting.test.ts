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

test('minutes are never lost to floating point', () => {
  for (let m = 0; m < 48 * 60; m++) {
    assert.equal(hoursText(m / 60), `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`, `${m} minutes`);
  }
});

test('a fast that ended just after midnight before a clock change keeps its day', () => {
  // 00:30 EDT on 30 Oct 2026 is 04:30 UTC; New York is on EST (UTC-5) a week later.
  const f: Fast = { id: 'a', startedAt: '2026-10-29T12:00:00Z', endedAt: '2026-10-30T04:30:00Z', targetHours: 16 };
  assert.equal(fastStreak([f], '2026-10-31', 'America/New_York'), 1);
  // The older fixed offset (EST, 300) puts it on the 29th, so a day later the streak is gone.
  assert.equal(fastStreak([f], '2026-10-31', 300), 0);
  // The old server format still works without a zone.
  const old: Fast = { ...f, endedAt: '2026-10-30 04:30:00+00' };
  assert.doesNotThrow(() => fastStreak([old], '2026-10-30'));
});
