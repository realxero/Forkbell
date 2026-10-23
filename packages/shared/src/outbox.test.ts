import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, enqueue, newId, type OutboxItem } from './outbox.ts';

let n = 0;
const item = (path: string, coalesceKey: string | null = null, method: OutboxItem['method'] = 'PUT'): OutboxItem => ({
  id: String(++n), method, path, body: { n }, coalesceKey, label: path, createdAt: n, attempts: 0,
});

test('repeated workout saves collapse into the latest one', () => {
  let q: OutboxItem[] = [];
  q = enqueue(q, item('/api/workouts', null, 'POST'));
  for (let i = 0; i < 20; i++) q = enqueue(q, item('/api/workouts/w1', 'workout:w1'));
  assert.equal(q.length, 2);
  assert.equal(q[0]!.method, 'POST'); // creating it still comes first
});

test('a save is not moved past a later change to the same workout', () => {
  let q: OutboxItem[] = [];
  q = enqueue(q, item('/api/workouts/w1', 'workout:w1'));
  q = enqueue(q, item('/api/workouts/w1/finish', null, 'POST'));
  q = enqueue(q, item('/api/workouts/w1', 'workout:w1'));
  assert.deepEqual(q.map((x) => x.path), ['/api/workouts/w1', '/api/workouts/w1/finish', '/api/workouts/w1']);
});

test('unrelated changes in between do not stop collapsing', () => {
  let q: OutboxItem[] = [];
  q = enqueue(q, item('/api/progress/weigh-ins', 'weigh:2026-10-23'));
  q = enqueue(q, item('/api/diary', null, 'POST'));
  q = enqueue(q, item('/api/progress/weigh-ins', 'weigh:2026-10-23'));
  assert.equal(q.length, 2);
  assert.equal(q.at(-1)!.coalesceKey, 'weigh:2026-10-23');
});

test('server answers decide what happens to a change', () => {
  assert.equal(classify(201, 'POST'), 'ok');
  assert.equal(classify(404, 'DELETE'), 'ok');
  assert.equal(classify(400, 'POST'), 'rejected');
  assert.equal(classify(500, 'PUT'), 'retry');
  assert.equal(classify(0, 'PUT'), 'retry');
  assert.equal(classify(401, 'PUT'), 'retry');
});

test('device ids look like real UUIDs', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
