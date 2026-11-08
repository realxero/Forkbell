import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instant, isTimeZone, mealForTime, todayIn, todayLocal, toIso } from './dates.ts';

test('times from the server, old and new', () => {
  const want = Date.UTC(2026, 9, 21, 0, 10, 0, 123);
  assert.equal(instant('2026-10-21 00:10:00.123456+00'), want);
  assert.equal(instant('2026-10-21T00:10:00.123+00:00'), want);
  assert.equal(instant('2026-10-21T00:10:00.123Z'), want);
  assert.ok(Number.isNaN(instant('nope')));
  assert.equal(toIso('2026-10-21 00:10:00+00'), '2026-10-21T00:10:00.000Z');
});

test('today and the meal in someone else’s time zone, whatever this machine’s clock says', () => {
  const late = new Date(Date.UTC(2026, 10, 9, 1, 30)); // 1:30 am UTC on the 9th
  assert.equal(todayIn('America/New_York', late), '2026-11-08'); // 8:30 pm the evening before
  assert.equal(todayIn('Asia/Tokyo', late), '2026-11-09');
  assert.equal(todayIn('UTC', late), '2026-11-09');
  assert.equal(mealForTime(late, 'America/New_York'), 'dinner');
  assert.equal(mealForTime(late, 'Asia/Kolkata'), 'breakfast'); // 7:00 am
  // No time zone, or one nobody knows: this machine's own today.
  assert.equal(todayIn(null, late), todayLocal(late));
  assert.equal(todayIn('Mars/Olympus_Mons', late), todayLocal(late));
  assert.ok(isTimeZone('Europe/London'));
  assert.ok(!isTimeZone('Mars/Olympus_Mons'));
});
