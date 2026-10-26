import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instant, toIso } from './dates.ts';

test('times from the server, old and new', () => {
  const want = Date.UTC(2026, 9, 21, 0, 10, 0, 123);
  assert.equal(instant('2026-10-21 00:10:00.123456+00'), want);
  assert.equal(instant('2026-10-21T00:10:00.123+00:00'), want);
  assert.equal(instant('2026-10-21T00:10:00.123Z'), want);
  assert.ok(Number.isNaN(instant('nope')));
  assert.equal(toIso('2026-10-21 00:10:00+00'), '2026-10-21T00:10:00.000Z');
});
