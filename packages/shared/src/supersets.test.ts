import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterSet, leaveSuperset, linkWithNext, nextSetKind, splitAfter, supersetLetter, supersetRun, tidySupersets } from './supersets.ts';

const set = (done = false, extra: { warmup?: boolean; drop?: boolean } = {}) => ({ weightKg: 50, reps: 8, seconds: null, rpe: null, warmup: false, done, ...extra });
const ex = (rest: number, sets: ReturnType<typeof set>[], superset: number | null = null) => ({ restSeconds: rest, sets, superset });

test('tidying: runs of neighbours, renumbered, no runs of one', () => {
  assert.deepEqual(tidySupersets([5, 5, null, 2, 2, 2, 7]), [1, 1, null, 2, 2, 2, null]);
  assert.deepEqual(tidySupersets([1, null, 1]), [null, null, null], 'apart is not together');
  assert.deepEqual(tidySupersets([3, 3, 3, 4, 4]), [1, 1, 1, 2, 2]);
});

test('linking with the next, again for a circuit, and leaving', () => {
  let g = linkWithNext([null, null, null, null], 0);
  assert.deepEqual(g, [1, 1, null, null], 'a superset');
  g = linkWithNext(g, 1);
  assert.deepEqual(g, [1, 1, 1, null], 'again on the next one: a circuit of three');
  assert.deepEqual(supersetRun(g, 2), [0, 1, 2]);
  assert.deepEqual(linkWithNext([null, null, 1, 1], 1), [null, 1, 1, 1], 'joining a superset pulls it all in');
  assert.deepEqual(linkWithNext([1, 1], 1), [1, 1], 'the last exercise has no next');
  assert.deepEqual(leaveSuperset([1, 1, 1], 2), [1, 1, null]);
  assert.deepEqual(leaveSuperset([1, 1], 0), [null, null], 'one left is no superset');
  assert.equal(supersetLetter(2), 'B');
});

test('a superset: straight on, then one rest (the longest) after the last', () => {
  const list = [ex(90, [set(true), set()], 1), ex(120, [set(), set()], 1), ex(60, [set()])];
  assert.deepEqual(afterSet(list, 0, 0), { rest: 0, next: 1, why: 'superset' });
  list[1]!.sets[0]!.done = true;
  assert.deepEqual(afterSet(list, 1, 0), { rest: 120, next: 0, why: 'rest' }, 'back to the first for round two');
  list[0]!.sets[1]!.done = true;
  list[1]!.sets[1]!.done = true;
  assert.deepEqual(afterSet(list, 1, 1), { rest: 120, next: 2, why: 'rest' }, 'then on to what comes after');
});

test('drop sets come straight after; warm-ups rest as usual', () => {
  const list = [ex(90, [set(true), set(false, { drop: true }), set(false, { drop: true })])];
  assert.deepEqual(afterSet(list, 0, 0), { rest: 0, next: 0, why: 'drop' });
  list[0]!.sets[1]!.done = true;
  assert.deepEqual(afterSet(list, 0, 1), { rest: 0, next: 0, why: 'drop' }, 'a double drop');
  const ss = [ex(90, [set(true, { warmup: true }), set()], 1), ex(90, [set()], 1)];
  assert.deepEqual(afterSet(ss, 0, 0), { rest: 90, next: 0, why: 'rest' }, 'a warm-up in a superset is not the round');
  assert.deepEqual(afterSet([ex(75, [set(true)])], 0, 0), { rest: 75, next: null, why: 'rest' });
});

test('tapping the set number cycles working, W, D', () => {
  assert.deepEqual(nextSetKind({ warmup: false }, false), { warmup: true, drop: false });
  assert.deepEqual(nextSetKind({ warmup: true }, false), { warmup: false, drop: true });
  assert.deepEqual(nextSetKind({ warmup: false, drop: true }, false), { warmup: false, drop: false });
  assert.deepEqual(nextSetKind({ warmup: true }, true), { warmup: false, drop: false }, 'the first set has nothing to drop from');
});

test('splitting a superset between two exercises', () => {
  assert.deepEqual(splitAfter([1, 1, 1, 1], 1), [1, 1, 2, 2], 'a circuit of four splits into two supersets');
  assert.deepEqual(splitAfter([1, 1, 1], 0), [null, 1, 1], 'one on its own is no superset');
  assert.deepEqual(splitAfter([1, 1, null], 1), [1, 1, null], 'nothing to split');
});
