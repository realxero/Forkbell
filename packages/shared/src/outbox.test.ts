import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterRejected, afterRetry, classify, enqueue, MAX_SERVER_ERRORS, newId, type OutboxItem } from './outbox.ts';

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

test('a change the server keeps failing is set aside, so it cannot block the rest', () => {
  let x: Pick<OutboxItem, 'serverErrors'> = {};
  for (let i = 1; i < MAX_SERVER_ERRORS; i++) {
    const r = afterRetry(x, 500);
    assert.equal(r.next, 'retry', `try ${i}`);
    x = { serverErrors: r.serverErrors };
  }
  assert.equal(afterRetry(x, 503).next, 'hold');
});

test('no connection, being signed out or slowed down never sets a change aside', () => {
  const tired = { serverErrors: MAX_SERVER_ERRORS + 3 };
  for (const status of [0, 401, 408, 429]) {
    const r = afterRetry(tired, status);
    assert.equal(r.next, 'retry', `status ${status}`);
    assert.equal(r.serverErrors, tired.serverErrors, 'and they do not count as server errors');
  }
});

test('a change to a record that is waiting in a set-aside change waits with it', () => {
  // A workout start was set aside; its sets then 404: keep them for "send again".
  assert.equal(afterRejected(404, 'PUT', 1), 'hold');
  assert.equal(afterRejected(404, 'PATCH', 2), 'hold');
  // Nothing set aside, a delete, or the server refusing the data itself: drop.
  assert.equal(afterRejected(404, 'PUT', 0), 'drop');
  assert.equal(afterRejected(404, 'DELETE', 1), 'drop');
  assert.equal(afterRejected(400, 'PUT', 1), 'drop');
});

test('meal plan edits offline: the same cell keeps its latest, other people stay apart, order is kept', () => {
  const put = (key: string, note: string): OutboxItem => ({ id: newId(), method: 'PUT', path: '/api/plans/meal-plan', body: { note }, coalesceKey: key, label: 'Plan', createdAt: 0, attempts: 0 });
  let q: OutboxItem[] = [];
  q = enqueue(q, put('plan:alice:1:lunch', 'a'));
  q = enqueue(q, put('plan:alice:1:lunch', 'b'));
  assert.equal(q.length, 1, 'same person, day and meal: the latest only');
  assert.deepEqual(q[0]!.body, { note: 'b' });
  q = enqueue(q, put('plan:bob:1:lunch', 'c'));
  assert.equal(q.length, 2, "another client's same cell is a separate change");
  q = enqueue(q, put('plan:alice:1:lunch', 'd'));
  // A change to the same kind of record sits in between, so nothing is merged past it:
  // all three go up in order, and Alice's latest note still arrives last.
  assert.deepEqual(q.map((i) => [i.coalesceKey, (i.body as { note: string }).note]), [['plan:alice:1:lunch', 'b'], ['plan:bob:1:lunch', 'c'], ['plan:alice:1:lunch', 'd']]);
});
