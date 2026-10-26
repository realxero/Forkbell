import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstAndLatest, photoDays, trendOnDate, type ProgressPhoto } from './photos.ts';

const p = (id: string, date: string, pose: ProgressPhoto['pose'], createdAt = `${date}T08:00:00Z`): ProgressPhoto => ({ id, date, pose, createdAt });

test('first and latest of a pose', () => {
  const list = [p('a', '2026-09-01', 'front'), p('b', '2026-10-25', 'front'), p('c', '2026-10-01', 'front'), p('d', '2026-10-25', 'side'), p('e', '2026-10-25', 'front', '2026-10-25T09:00:00Z')];
  assert.deepEqual([firstAndLatest(list, 'front').first?.id, firstAndLatest(list, 'front').latest?.id], ['a', 'e'], 'the last one added that day');
  assert.deepEqual(firstAndLatest(list, 'side'), { first: list[3], latest: null }, 'one photo: nothing to compare yet');
  assert.deepEqual(firstAndLatest(list, 'back'), { first: null, latest: null });
});

test('days, newest first, poses in order', () => {
  const days = photoDays([p('a', '2026-10-01', 'back'), p('b', '2026-10-01', 'front'), p('c', '2026-10-20', 'side')]);
  assert.deepEqual(days.map((d) => [d.date, d.photos.map((x) => x.id)]), [['2026-10-20', ['c']], ['2026-10-01', ['b', 'a']]]);
});

test('the weight trend on a photo’s day', () => {
  const pts = [{ date: '2026-10-01', trendKg: 90 }, { date: '2026-10-10', trendKg: 88.5 }];
  assert.equal(trendOnDate(pts, '2026-10-05'), 90);
  assert.equal(trendOnDate(pts, '2026-10-25'), 88.5);
  assert.equal(trendOnDate(pts, '2026-09-29'), 90, 'a weigh-in two days later is close enough');
  assert.equal(trendOnDate(pts, '2026-09-01'), null);
  assert.equal(trendOnDate([], '2026-10-01'), null);
});
