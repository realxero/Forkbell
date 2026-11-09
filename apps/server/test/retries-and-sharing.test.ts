// Things the offline outbox and family sharing rely on, pinned down over HTTP:
// a change sent twice (the answer was lost) is saved once, finishing a workout
// keeps only what was done, and someone you share with can do only what you allowed.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, newUser, startServer, stopServer } from './harness.ts';

before(startServer);
after(stopServer);

const food = { name: 'Retry oats', brand: null, source: 'custom', sourceId: null, per100: { kcal: 380, protein: 13, carbs: 67, fat: 7 }, servingGrams: null, servingLabel: null, barcode: null, portions: [] };

test('a diary entry sent twice with the same id is logged once, as first sent', async () => {
  const u = await newUser();
  const id = crypto.randomUUID();
  const first = await u.call('POST', '/api/diary', { id, date: '2026-10-20', meal: 'breakfast', grams: 50, food });
  assert.equal(first.status, 201, first.text);
  const again = await u.call('POST', '/api/diary', { id, date: '2026-10-20', meal: 'breakfast', grams: 80, food });
  assert.ok(again.status < 300, again.text);
  assert.equal(again.body.entry.id, first.body.entry.id);
  const day = (await u.call('GET', '/api/diary/2026-10-20')).body;
  assert.equal(day.entries.length, 1, 'logged once');
  assert.equal(day.entries[0].grams, 50, 'the first one sent wins');
});

test('a workout started twice with the same id is one workout; finishing keeps only done sets', async () => {
  const u = await newUser();
  const id = crypto.randomUUID();
  assert.ok((await u.call('POST', '/api/workouts', { id, date: '2026-10-21' })).status < 300);
  const again = await u.call('POST', '/api/workouts', { id, date: '2026-10-21' });
  assert.ok(again.status < 300, again.text);
  assert.equal(again.body.workout.id, id);

  const lift = (await u.call('GET', '/api/exercises')).body.exercises.find((x: { kind: string }) => x.kind === 'weight');
  const set = (done: boolean) => ({ weightKg: 60, reps: 8, seconds: null, rpe: null, warmup: false, done });
  const saved = await u.call('PUT', `/api/workouts/${id}`, { name: 'Retry', date: '2026-10-21', notes: null, exercises: [{ exerciseId: lift.id, restSeconds: 90, targetSets: null, repMin: null, repMax: null, sets: [set(true), set(false)] }] });
  assert.equal(saved.status, 200, saved.text);
  const done = await u.call('POST', `/api/workouts/${id}/finish`, {});
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.summary.sets, 1, 'the set never done is dropped');
  assert.equal(done.body.summary.volumeKg, 480, 'volume counts only the done set');
  const twice = await u.call('POST', `/api/workouts/${id}/finish`, {});
  assert.equal(Date.parse(twice.body.workout.finishedAt), Date.parse(done.body.workout.finishedAt), 'finishing again keeps the first end time');

  const empty = crypto.randomUUID();
  assert.ok((await u.call('POST', '/api/workouts', { id: empty, date: '2026-10-22' })).status < 300);
  assert.equal((await u.call('POST', `/api/workouts/${empty}/finish`, {})).body.discarded, true, 'nothing done: discarded');
  assert.equal((await u.call('GET', `/api/workouts/${empty}`)).status, 404);
});

test('sharing: food_read lets you look, not log; training and writes stay closed', async () => {
  const alice = await newUser('Alice');
  const bob = await newUser('Bob');
  const invite = await alice.call('POST', '/api/shares/invites', { permissions: ['food_read', 'training_read'] });
  assert.equal(invite.status, 201, invite.text);
  assert.equal((await alice.call('POST', '/api/shares/accept', { code: invite.body.code })).status, 400, 'not your own invite');
  assert.equal((await bob.call('POST', '/api/shares/accept', { code: invite.body.code })).status, 200);
  const carol = await newUser('Carol');
  assert.equal((await carol.call('POST', '/api/shares/accept', { code: invite.body.code })).status, 404, 'an invite works once');

  const as = (profile: string) => (method: string, p: string, body?: unknown) =>
    fetch(`${BASE}${p}`, {
      method,
      headers: { authorization: `Bearer ${bob.token}`, 'x-forkbell-profile': profile, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => r.status);
  const forAlice = as(alice.id);
  assert.equal(await forAlice('GET', '/api/diary/2026-10-20'), 200);
  assert.equal(await forAlice('POST', '/api/diary', { date: '2026-10-20', meal: 'lunch', grams: 50, food }), 403, 'reading food is not logging it');
  assert.equal(await forAlice('GET', '/api/workouts'), 200);
  assert.equal(await forAlice('POST', '/api/workouts', { date: '2026-10-20' }), 403, 'training is never written by someone else');
  assert.equal(await forAlice('GET', '/api/progress?today=2026-10-20'), 403, 'progress was not shared');
  assert.equal(await as('nope')('GET', '/api/diary/2026-10-20'), 400);

  const { sharingWith } = (await alice.call('GET', '/api/shares')).body as { sharingWith: { shareId: string; permissions: string[] }[] };
  assert.deepEqual(sharingWith[0]!.permissions.sort(), ['food_read', 'training_read']);
  assert.equal((await alice.call('DELETE', `/api/shares/${sharingWith[0]!.shareId}`)).status, 200);
  assert.equal(await forAlice('GET', '/api/diary/2026-10-20'), 403, 'gone once she stops sharing');
});

test('wrong share codes are limited', async () => {
  const u = await newUser();
  for (let i = 0; i < 10; i++) assert.equal((await u.call('POST', '/api/shares/accept', { code: 'ZZZZZZZZ' })).status, 404);
  assert.equal((await u.call('POST', '/api/shares/accept', { code: 'ZZZZZZZZ' })).status, 429);
});

test('a saved meal sent twice with the same id is saved once', async () => {
  const u = await newUser();
  const add = await u.call('POST', '/api/diary', { date: '2026-10-20', meal: 'lunch', grams: 50, food });
  const foodId = add.body.entry.food.id;
  const id = crypto.randomUUID();
  const first = await u.call('POST', '/api/meals', { id, name: 'Usual lunch', items: [{ foodId, grams: 50 }] });
  assert.equal(first.status, 201, first.text);
  const again = await u.call('POST', '/api/meals', { id, name: 'Usual lunch', items: [{ foodId, grams: 50 }] });
  assert.equal(again.body.id, id);
  assert.equal((await u.call('GET', '/api/meals')).body.meals.length, 1);
});

test('adding to a past day keeps the goals that day already had', async () => {
  const u = await newUser();
  await u.call('POST', '/api/diary', { date: '2026-01-05', meal: 'lunch', grams: 50, food });
  const before = (await u.call('GET', '/api/diary/2026-01-05')).body.goals.kcal;
  assert.equal((await u.call('PUT', '/api/me/goals', { kcal: before + 500, protein: 150, carbs: 200, fat: 70 })).status, 200);
  await u.call('POST', '/api/diary', { date: '2026-01-05', meal: 'snacks', grams: 20, food });
  assert.equal((await u.call('GET', '/api/diary/2026-01-05')).body.goals.kcal, before, 'last January keeps its own goal');
});

test('activating a program that is gone leaves the active one alone', async () => {
  const u = await newUser();
  const made = await u.call('POST', '/api/programs', { name: 'Mine' });
  assert.ok(made.status < 300, made.text);
  const id = made.body.id ?? made.body.program?.id;
  assert.ok((await u.call('POST', `/api/programs/${id}/activate`, {})).status < 300);
  assert.equal((await u.call('POST', `/api/programs/${crypto.randomUUID()}/activate`, {})).status, 404);
  const list = (await u.call('GET', '/api/programs')).body;
  const programs = (list.programs ?? list.mine) as { id: string; active: boolean }[];
  assert.equal(programs.find((p) => p.id === id)?.active, true, 'still active');
});
