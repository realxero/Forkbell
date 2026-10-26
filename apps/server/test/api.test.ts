// Regression tests for the API, against a real server and database. They pin
// down behaviour that broke (or nearly did) before, so it can't quietly come back.
//   DATABASE_ADMIN_URL=... DATABASE_URL=... pnpm --filter @forkbell/server test:api
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, caller, newUser, serverLog, startServer, stopServer } from './harness.ts';

const NOT_HERE = 'Your Forkbell server doesn’t have this yet. Update the server to the same version as the app.';
const anon = caller(null);

before(startServer);
after(stopServer);
const explain = (what: string) => `${what}\n--- server log ---\n${serverLog().slice(-3000)}`;

test('health, and signed-out requests get a JSON 401', async () => {
  assert.equal((await anon('GET', '/healthz')).status, 200);
  const r = await anon('GET', '/api/me');
  assert.equal(r.status, 401);
  assert.match(r.type, /json/);
});

test('an /api path the server lacks is a JSON 404, never the web page', async () => {
  const u = await newUser();
  const r = await u.call('GET', '/api/not-a-real-thing');
  assert.equal(r.status, 404);
  assert.match(r.type, /json/, 'answered with a page: the app would blame the reverse proxy');
  assert.equal(r.body.error, NOT_HERE);
});

/** Every /api path the app's source asks for, with placeholders filled in. */
async function appPaths() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../app');
  const files: string[] = [];
  for (const dir of ['app', 'lib', 'components', 'modules']) {
    const entries = await readdir(path.join(root, dir), { recursive: true, withFileTypes: true }).catch(() => []);
    // lib/profile.ts only lists path prefixes that can be shared; it doesn't call them.
    for (const e of entries) if (e.isFile() && /\.tsx?$/.test(e.name) && !(dir === 'lib' && e.name === 'profile.ts')) files.push(path.join(e.parentPath, e.name));
  }
  const found = new Set<string>();
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    for (const m of src.matchAll(/['"`](\/api\/[^'"`\s]*)/g)) {
      let p = m[1]!;
      if (p.startsWith('/api/media/')) continue; // public pictures, checked below
      const [pathPart, query] = p.split('?') as [string, string | undefined];
      let fixed = pathPart.replace(/\$\{[^}]*\}/g, '00000000-0000-4000-8000-000000000000');
      if (fixed.endsWith('/')) fixed += '00000000-0000-4000-8000-000000000000';
      p = fixed + (query ? `?${query.replace(/\$\{[^}]*\}/g, '2026-10-24')}` : '');
      found.add(p);
    }
  }
  return [...found].sort();
}

test('every API path the app calls exists on the server', async () => {
  const u = await newUser();
  const paths = await appPaths();
  assert.ok(paths.length > 40, `found ${paths.length} paths`);
  const missing: string[] = [];
  for (const p of paths) {
    let exists = false;
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const r = await u.call(method, p, method === 'GET' || method === 'DELETE' ? undefined : {});
      assert.ok(r.status < 500 || [502, 503].includes(r.status), explain(`${method} ${p} crashed with ${r.status}: ${r.text.slice(0, 200)}`));
      if (!(r.status === 404 && r.body?.error === NOT_HERE)) {
        exists = true;
        break;
      }
    }
    if (!exists) missing.push(p);
  }
  assert.deepEqual(missing, [], 'the app calls these, but the server has no such route');
});

test('stretches: warm-ups, stretches and foam rolling, with pictures the server will fetch', async () => {
  const u = await newUser();
  const r = await u.call('GET', '/api/stretches');
  assert.equal(r.status, 200);
  const list = r.body.stretches as { kind: string; howToRef: string; pictures: number }[];
  assert.ok(list.length >= 100);
  for (const kind of ['dynamic', 'static', 'roll']) assert.ok(list.some((s) => s.kind === kind), kind);
  const pic = await anon('GET', `/api/media/exercise/${encodeURIComponent(list[0]!.howToRef)}/0.jpg`);
  assert.notEqual(pic.status, 404, 'a stretch picture must be one the server allows');
});

test('medication reminder times: saved per dose, kept when not sent, checked when sent', async () => {
  const u = await newUser();
  const made = await u.call('POST', '/api/wellbeing/medications', { name: 'Vitamin D', dose: '1000 IU', timesPerDay: 2, notes: null, reminderTimes: ['08:00', ''] });
  assert.equal(made.status, 201, made.text);
  const get = async () => (await u.call('GET', '/api/wellbeing?today=2026-10-24')).body.medications[0];
  assert.deepEqual((await get()).reminderTimes, ['08:00', null]);
  // Pausing it from an older app (no reminderTimes) must not wipe the times.
  assert.equal((await u.call('PUT', `/api/wellbeing/medications/${made.body.id}`, { name: 'Vitamin D', dose: '1000 IU', timesPerDay: 2, notes: null, active: false })).status, 200);
  assert.deepEqual((await get()).reminderTimes, ['08:00', null]);
  assert.equal((await u.call('PUT', `/api/wellbeing/medications/${made.body.id}`, { name: 'Vitamin D', dose: null, timesPerDay: 1, notes: null, reminderTimes: ['25:00'] })).status, 400);
});

test('saved plates and bowls survive a round trip through preferences', async () => {
  const u = await newUser();
  const me = (await u.call('GET', '/api/me')).body;
  const containers = [{ id: 'p1', name: 'Big plate', grams: 410 }];
  assert.equal((await u.call('PUT', '/api/me/preferences', { ...me.preferences, containers })).status, 200);
  assert.deepEqual((await u.call('GET', '/api/me')).body.preferences.containers, containers);
});

test('export: your diary as JSON and CSV, nothing secret, nothing of anyone else', async () => {
  const a = await newUser('Alice');
  const b = await newUser('Bob');
  const food = { name: 'Regression oats', brand: null, source: 'custom', sourceId: null, per100: { kcal: 380, protein: 13, carbs: 67, fat: 7 }, servingGrams: null, servingLabel: null, barcode: null, portions: [] };
  const add = await a.call('POST', '/api/diary', { date: '2026-10-24', meal: 'breakfast', grams: 50, food });
  assert.ok(add.status < 300, add.text);
  const json = await a.call('GET', '/api/export');
  assert.equal(json.status, 200);
  assert.equal(json.body.data.diaryEntries.length, 1);
  assert.ok(!/token_hash|tokenHash|keyCiphertext|key_ciphertext/.test(json.text), 'no secrets in the export');
  const csv = await a.call('GET', '/api/export/diary.csv');
  assert.match(csv.type, /text\/csv/);
  assert.match(csv.text, /2026-10-24,breakfast,Regression oats,,50,190/);
  assert.equal((await b.call('GET', '/api/export')).body.data.diaryEntries.length, 0, "Bob's export has none of Alice's diary");
});

test('a Shortcut key only works for Shortcuts, and stops working when removed', async () => {
  const u = await newUser();
  const made = await u.call('POST', '/api/shortcuts/keys', { label: 'Test' });
  assert.equal(made.status, 201);
  const key = caller(made.body.token);
  assert.equal((await key('GET', '/api/me')).status, 403, 'a key cannot read the account');
  assert.equal((await key('GET', '/api/export')).status, 403, 'or export it');
  assert.equal((await key('POST', '/api/shortcuts/keys', { label: 'Another' })).status, 403, 'or make more keys');
  const today = await key('GET', '/api/shortcuts/today?today=2026-10-24');
  assert.equal(today.status, 200, today.text);
  assert.equal(typeof today.body.speak, 'string');
  const list = (await u.call('GET', '/api/shortcuts/keys')).body.keys;
  assert.equal(list.length, 1);
  assert.equal((await u.call('DELETE', `/api/shortcuts/keys/${list[0].id}`)).status, 200);
  assert.equal((await key('GET', '/api/shortcuts/today')).status, 401, 'removed means removed');
});

test('the web page is never cached, so a new version shows on the next load', async () => {
  // Only when the server serves the web app (WEB_DIR set, as in the Docker image and the monkey test).
  if (!process.env.WEB_DIR) return;
  const r = await fetch('http://localhost:' + (process.env.TEST_PORT ?? 3999) + '/stretches');
  assert.equal(r.headers.get('cache-control'), 'no-cache');
});

test('streaks for Bell’s celebrations: a light route with start dates', async () => {
  const u = await newUser();
  const r = await u.call('GET', '/api/progress/streaks?today=2026-10-25');
  assert.equal(r.status, 200);
  assert.equal(r.body.foodDays, 0);
  assert.equal(r.body.foodSince, null);
  assert.equal(r.body.workoutWeeks, 0);
});

test('an exercise page lists variations and ways to progress besides weight', async () => {
  const u = await newUser();
  const list = await u.call('GET', '/api/exercises?q=bench press');
  const bench = list.body.exercises.find((e: { name: string }) => e.name === 'Bench press');
  assert.ok(bench, 'the built-in bench press');
  const r = await u.call('GET', `/api/exercises/${bench.id}`);
  assert.equal(r.status, 200);
  const names = r.body.variations.map((v: { exercise: { name: string } }) => v.exercise.name);
  assert.ok(names.includes('Incline bench press'), names.join(', '));
  assert.ok(r.body.variations.every((v: { level: string }) => ['harder', 'angle', 'easier'].includes(v.level)));
  assert.ok(r.body.progressIdeas.some((i: { key: string }) => i.key === 'slow'));
});

test('without a speech server, Bell says so and the app uses the phone’s voice', async () => {
  const u = await newUser();
  assert.equal((await u.call('GET', '/api/bell/status')).body.tts, false);
  assert.equal((await u.call('GET', '/api/bell/voices')).body.server, false);
  const r = await u.call('GET', '/api/bell/speak?text=hello');
  assert.equal(r.status, 404);
  assert.match(r.type, /json/);
});

test('water: add (once, even if sent twice), total by day, undo, and nobody else sees it', async () => {
  const a = await newUser('Alice');
  const b = await newUser('Bob');
  const id = crypto.randomUUID();
  assert.equal((await a.call('POST', '/api/wellbeing/water', { id, date: '2026-10-25', ml: 500 })).status, 201);
  assert.equal((await a.call('POST', '/api/wellbeing/water', { id, date: '2026-10-25', ml: 500 })).status, 201, 'a resend is fine');
  assert.equal((await a.call('POST', '/api/wellbeing/water', { date: '2026-10-25', ml: 237 })).status, 201);
  assert.equal((await a.call('POST', '/api/wellbeing/water', { date: '2026-10-24', ml: 1000 })).status, 201);
  assert.equal((await a.call('POST', '/api/wellbeing/water', { date: '2026-10-25', ml: 0 })).status, 400);
  assert.equal((await a.call('POST', '/api/wellbeing/water', { date: '2026-10-25', ml: 9000 })).status, 400);
  const day = (await a.call('GET', '/api/wellbeing/water/2026-10-25')).body;
  assert.equal(day.totalMl, 737, 'the resend was counted once, other days are apart');
  assert.deepEqual(day.entries.map((e: { ml: number }) => e.ml), [500, 237], 'in the order they were logged');
  assert.equal((await b.call('GET', '/api/wellbeing/water/2026-10-25')).body.totalMl, 0, "Bob can't see Alice's water");
  assert.equal((await b.call('DELETE', `/api/wellbeing/water/${id}`)).status, 404, "or take it back");
  assert.equal((await a.call('DELETE', `/api/wellbeing/water/${day.entries[1].id}`)).status, 200);
  assert.equal((await a.call('GET', '/api/wellbeing/water/2026-10-25')).body.totalMl, 500);
  const exported = (await a.call('GET', '/api/export')).body.data.waterEntries;
  assert.equal(exported.length, 2, 'water is in the export');
  assert.equal((await b.call('GET', '/api/export')).body.data.waterEntries.length, 0);
  const me = (await a.call('GET', '/api/me')).body;
  assert.deepEqual(me.preferences.water, { show: true, goalMl: 2000 }, 'the goal starts at 2 L, card shown');
  assert.equal((await a.call('PUT', '/api/me/preferences', { ...me.preferences, water: { show: false, goalMl: 3000 } })).status, 200);
  assert.deepEqual((await a.call('GET', '/api/me')).body.preferences.water, { show: false, goalMl: 3000 });
});

test('workouts keep supersets and drop sets; drop sets never set records', async () => {
  const u = await newUser();
  const list = (await u.call('GET', '/api/exercises')).body.exercises as { id: string; name: string; kind: string }[];
  const [a, b, c] = list.filter((x) => x.kind === 'weight');
  const started = await u.call('POST', '/api/workouts', { date: '2026-10-25' });
  assert.ok(started.status < 300, started.text);
  const id = started.body.workout.id;
  const set = (kg: number, extra: Record<string, unknown> = {}) => ({ weightKg: kg, reps: 8, seconds: null, rpe: null, warmup: false, done: true, ...extra });
  const ex = (exerciseId: string, sets: unknown[], superset: number | null) => ({ exerciseId, restSeconds: 90, targetSets: null, repMin: null, repMax: null, sets, superset });
  const saved = await u.call('PUT', `/api/workouts/${id}`, {
    name: 'Supersets',
    date: '2026-10-25',
    notes: null,
    exercises: [ex(a!.id, [set(100), set(80, { drop: true }), set(60, { drop: true, warmup: true })], 7), ex(b!.id, [set(40)], 7), ex(c!.id, [set(20)], 9)],
  });
  assert.equal(saved.status, 200, saved.text);
  const w = (await u.call('GET', `/api/workouts/${id}`)).body.workout;
  assert.deepEqual(w.exercises.map((e: { superset: number | null }) => e.superset), [1, 1, null], 'renumbered, and a superset of one is none');
  assert.deepEqual(w.exercises[0].sets.map((s: { drop: boolean }) => s.drop), [false, true, false], 'a warm-up is never also a drop set');
  // An older app that doesn't send these still saves.
  const old = await u.call('PUT', `/api/workouts/${id}`, { name: 'Old app', date: '2026-10-25', notes: null, exercises: [{ exerciseId: a!.id, restSeconds: 90, targetSets: null, repMin: null, repMax: null, sets: [{ weightKg: 100, reps: 8, seconds: null, rpe: null, warmup: false, done: true }] }] });
  assert.equal(old.status, 200, old.text);
  await u.call('PUT', `/api/workouts/${id}`, { name: 'Drops', date: '2026-10-25', notes: null, exercises: [ex(a!.id, [set(100, { reps: 3 }), set(90, { drop: true, reps: 12 })], null)] });
  assert.ok((await u.call('POST', `/api/workouts/${id}/finish`, {})).status < 300);
  const records = (await u.call('GET', `/api/exercises/${a!.id}`)).body.records as { kind: string; weightKg: number; reps: number }[];
  const e1rm = records.find((r) => r.kind === 'e1rm');
  assert.equal(e1rm?.weightKg, 100, 'the drop set (90 × 12) is not the best estimated max');
  const csv = await u.call('GET', '/api/export/workouts.csv');
  assert.match(csv.text, /,drop_set,/);
  assert.match(csv.text, /,yes,\r\n/, 'the drop set is marked in the CSV');
});

test('progress photos: only yours, never anyone else’s, even family you share everything with', async () => {
  const a = await newUser('Alice');
  const b = await newUser('Bob');
  // A tiny real JPEG-ish payload (the server only checks type and size).
  const bytes = Buffer.alloc(2048, 7);
  const image = `data:image/jpeg;base64,${bytes.toString('base64')}`;
  const up = await a.call('POST', '/api/photos', { date: '2026-10-25', pose: 'front', image });
  assert.equal(up.status, 201, up.text);
  const id = up.body.photo.id;
  assert.equal(up.body.photo.pose, 'front');
  assert.equal((await a.call('POST', '/api/photos', { date: '2026-10-25', pose: 'top', image })).status, 400, 'front, side or back');
  assert.equal((await a.call('POST', '/api/photos', { date: '2026-10-25', pose: 'side', image: 'data:image/gif;base64,AAAA' })).status, 400);
  assert.equal((await a.call('GET', '/api/photos')).body.photos.length, 1);
  const own = await fetch(`${BASE}/api/photos/${id}/image`, { headers: { authorization: `Bearer ${a.token}` } });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/jpeg');
  assert.ok(Buffer.from(await own.arrayBuffer()).equals(bytes), 'the same picture comes back');

  // Alice shares everything with Bob.
  const invite = await a.call('POST', '/api/shares/invites', { permissions: ['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read'] });
  assert.equal(invite.status, 201, invite.text);
  assert.equal((await b.call('POST', '/api/shares/accept', { code: invite.body.code })).status, 200);
  const asBob = (p: string, method = 'GET') => fetch(`${BASE}${p}`, { method, headers: { authorization: `Bearer ${b.token}`, 'x-forkbell-profile': a.id } });
  assert.equal((await asBob('/api/progress?today=2026-10-25')).status, 200, 'Bob can see her progress');
  assert.deepEqual((await (await asBob('/api/photos')).json()).photos, [], 'but not her photos');
  assert.equal((await asBob(`/api/photos/${id}/image`)).status, 404);
  assert.equal((await asBob(`/api/photos/${id}`, 'DELETE')).status, 404);
  assert.equal((await b.call('GET', `/api/photos/${id}/image`)).status, 404);
  assert.equal((await a.call('GET', '/api/export')).body.data.progressPhotos.length, 1, 'listed in the export');
  assert.ok(!(await a.call('GET', '/api/export')).text.includes(bytes.toString('base64').slice(0, 40)), 'the picture itself is left out of the export');
  assert.equal((await a.call('DELETE', `/api/photos/${id}`)).status, 200);
  assert.equal((await a.call('GET', '/api/photos')).body.photos.length, 0);
});

test('fasting: one at a time, sent twice counts once, ends after it starts, counts toward a streak', async () => {
  const a = await newUser('Alice');
  const b = await newUser('Bob');
  const id = crypto.randomUUID();
  const start = new Date(Date.now() - 17 * 3_600_000).toISOString();
  assert.equal((await a.call('POST', '/api/wellbeing/fasts', { id, startedAt: start, targetHours: 16 })).status, 201);
  assert.equal((await a.call('POST', '/api/wellbeing/fasts', { id, startedAt: start, targetHours: 16 })).status, 201, 'a resend is fine');
  assert.equal((await a.call('POST', '/api/wellbeing/fasts', { targetHours: 16 })).status, 409, 'one at a time');
  assert.equal((await a.call('POST', '/api/wellbeing/fasts', { targetHours: 16, startedAt: new Date(Date.now() + 3_600_000).toISOString() })).status, 400, 'not in the future');
  const open = (await a.call('GET', '/api/wellbeing/fasts')).body;
  assert.equal(open.open.id, id);
  assert.equal((await b.call('GET', '/api/wellbeing/fasts')).body.open, null, "Bob can't see Alice's fast");
  assert.equal((await b.call('POST', `/api/wellbeing/fasts/${id}/end`, {})).status, 404, 'or end it');
  assert.equal((await a.call('POST', `/api/wellbeing/fasts/${id}/end`, { endedAt: new Date(Date.parse(start) - 60_000).toISOString() })).status, 404, 'an end before the start');
  assert.equal((await a.call('POST', `/api/wellbeing/fasts/${id}/end`, {})).status, 200);
  assert.equal((await a.call('POST', `/api/wellbeing/fasts/${id}/end`, {})).status, 200, 'ending twice is fine');
  const after = (await a.call('GET', `/api/wellbeing/fasts?today=${new Date().toISOString().slice(0, 10)}&tz=0`)).body;
  assert.equal(after.open, null);
  assert.equal(after.recent.length, 1);
  assert.equal(after.streak, 1, '17 hours of a 16-hour goal counts');
  assert.equal((await a.call('GET', '/api/export')).body.data.fasts.length, 1, 'fasts are in the export');
  const me = (await a.call('GET', '/api/me')).body;
  assert.deepEqual(me.preferences.fasting, { show: false, hours: 16 }, 'off until you turn it on');
});

test('cardio: built in, logged as time and distance, longest time is the record', async () => {
  const u = await newUser();
  const list = (await u.call('GET', '/api/exercises')).body.exercises as { id: string; name: string; kind: string }[];
  const run = list.find((x) => x.kind === 'cardio' && x.name === 'Run');
  assert.ok(run, 'Run is a built-in cardio exercise');
  assert.ok(list.filter((x) => x.kind === 'cardio').length >= 12);
  const id = (await u.call('POST', '/api/workouts', { date: '2026-10-25' })).body.workout.id;
  const bout = (seconds: number, distanceM: number | null) => ({ weightKg: null, reps: null, seconds, rpe: null, warmup: false, done: true, distanceM });
  const saved = await u.call('PUT', `/api/workouts/${id}`, { name: 'Run', date: '2026-10-25', notes: null, exercises: [{ exerciseId: run!.id, restSeconds: 0, targetSets: null, repMin: null, repMax: null, sets: [bout(1800, 5000), bout(600, null)] }] });
  assert.equal(saved.status, 200, saved.text);
  const w = (await u.call('GET', `/api/workouts/${id}`)).body.workout;
  assert.deepEqual(w.exercises[0].sets.map((x: { seconds: number; distanceM: number | null }) => [x.seconds, x.distanceM]), [[1800, 5000], [600, null]]);
  assert.ok((await u.call('POST', `/api/workouts/${id}/finish`, {})).status < 300);
  const records = (await u.call('GET', `/api/exercises/${run!.id}`)).body.records as { kind: string; value: number }[];
  assert.deepEqual(records.map((r) => [r.kind, r.value]), [['time', 1800]]);
  assert.match((await u.call('GET', '/api/export/workouts.csv')).text, /,5\r\n/, 'distance in km in the CSV');
  const made = await u.call('POST', '/api/exercises', { name: 'Battle ropes', muscle: 'full body', equipment: 'cardio', kind: 'cardio', restSeconds: 0 });
  assert.ok(made.status < 300, made.text);
});

test('water: daily totals for a range, for Apple Health', async () => {
  const u = await newUser();
  await u.call('POST', '/api/wellbeing/water', { date: '2026-10-20', ml: 500 });
  await u.call('POST', '/api/wellbeing/water', { date: '2026-10-20', ml: 250 });
  await u.call('POST', '/api/wellbeing/water', { date: '2026-10-22', ml: 1000 });
  await u.call('POST', '/api/wellbeing/water', { date: '2026-10-30', ml: 1000 });
  const r = await u.call('GET', '/api/wellbeing/water?from=2026-10-19&to=2026-10-25');
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.days, [{ date: '2026-10-20', ml: 750 }, { date: '2026-10-22', ml: 1000 }]);
  assert.equal((await u.call('GET', '/api/wellbeing/water?from=2026-01-01&to=2026-10-25')).status, 400, 'not a whole year at once');
});

test('a program day keeps its supersets, and a workout started from it has them', async () => {
  const u = await newUser();
  const list = (await u.call('GET', '/api/exercises')).body.exercises as { id: string; kind: string }[];
  const [a, b, c] = list.filter((x) => x.kind === 'weight');
  const program = (await u.call('POST', '/api/programs', { name: 'Arms' })).body.id;
  const day = (await u.call('POST', `/api/programs/${program}/routines`, { name: 'Arm day' })).body.id;
  const item = (exerciseId: string, superset: number | null) => ({ exerciseId, sets: 3, repMin: 8, repMax: 12, restSeconds: 60, superset });
  const saved = await u.call('PUT', `/api/routines/${day}`, { name: 'Arm day', exercises: [item(a!.id, 4), item(b!.id, 4), item(c!.id, 9)] });
  assert.equal(saved.status, 200, saved.text);
  const routine = (await u.call('GET', '/api/programs')).body.programs.find((p: { id: string }) => p.id === program).routines[0];
  assert.deepEqual(routine.exercises.map((x: { superset: number | null }) => x.superset), [1, 1, null], 'renumbered; one alone is no superset');
  const w = (await u.call('POST', '/api/workouts', { date: '2026-10-25', routineId: day })).body.workout;
  assert.deepEqual(w.exercises.map((x: { superset: number | null }) => x.superset), [1, 1, null], 'the workout starts with the superset');
  const old = await u.call('PUT', `/api/routines/${day}`, { name: 'Arm day', exercises: [{ exerciseId: a!.id, sets: 3, repMin: 8, repMax: 12, restSeconds: 60 }] });
  assert.equal(old.status, 200, 'an older app that sends no supersets still saves');
});

test('a past workout: logged finished, beside one going, and its day and times can be fixed', async () => {
  const u = await newUser();
  const going = (await u.call('POST', '/api/workouts', { date: '2026-10-25' })).body.workout;
  const startedAt = '2026-10-20T23:00:00.000Z';
  const finishedAt = '2026-10-21T00:10:00.000Z';
  const r = await u.call('POST', '/api/workouts', { date: '2026-10-20', startedAt, finishedAt });
  assert.equal(r.status, 201, r.text);
  const w = r.body.workout;
  assert.equal(Date.parse(w.finishedAt), Date.parse(finishedAt), 'saved finished, even with another workout going');
  assert.equal((await u.call('POST', '/api/workouts', { date: '2026-10-20', startedAt: finishedAt, finishedAt: startedAt })).status, 400, 'an end before the start');
  const ex = (await u.call('GET', '/api/exercises')).body.exercises.find((x: { kind: string }) => x.kind === 'weight');
  const set = { weightKg: 100, reps: 5, seconds: null, rpe: null, warmup: false, done: true };
  const moved = await u.call('PUT', `/api/workouts/${w.id}`, {
    name: 'Paper log', date: '2026-10-18', notes: null, startedAt: '2026-10-18T17:00:00.000Z', finishedAt: '2026-10-18T18:00:00.000Z',
    exercises: [{ exerciseId: ex.id, restSeconds: 90, targetSets: null, repMin: null, repMax: null, sets: [set] }],
  });
  assert.equal(moved.status, 200, moved.text);
  const after = (await u.call('GET', `/api/workouts/${w.id}`)).body.workout;
  assert.deepEqual([after.date, Date.parse(after.startedAt), Date.parse(after.finishedAt)], ['2026-10-18', Date.parse('2026-10-18T17:00:00Z'), Date.parse('2026-10-18T18:00:00Z')]);
  const sessions = (await u.call('GET', `/api/exercises/${ex.id}`)).body.sessions as { date: string }[];
  assert.ok(sessions.some((x) => x.date === '2026-10-18'), 'the history reads the new day');
  // A workout that's going can't be finished by saving it with a finish time.
  await u.call('PUT', `/api/workouts/${going.id}`, { name: 'Workout', date: '2026-10-25', notes: null, finishedAt: '2026-10-20T00:00:00.000Z', exercises: [] });
  assert.equal((await u.call('GET', `/api/workouts/${going.id}`)).body.workout.finishedAt, null);
});

test('importing workouts from another app: preview, then once only, matching names', async () => {
  const u = await newUser();
  const set = (weightKg: number | null, reps: number | null, extra: Record<string, unknown> = {}) => ({ weightKg, reps, seconds: null, distanceM: null, rpe: null, warmup: false, drop: false, ...extra });
  const workouts = [
    {
      date: '2026-03-15', startedAt: '2026-03-16T01:02:00.000Z', finishedAt: '2026-03-16T02:07:00.000Z', name: 'Push Day', notes: null,
      exercises: [
        { name: 'Bench Press (Barbell)', category: null, superset: null, sets: [set(40, 10, { warmup: true }), set(84, 8), set(60, 12, { drop: true })] },
        { name: 'Zercher Carry Thing', category: null, superset: null, sets: [set(50, 5)] },
      ],
    },
    { date: '2026-03-17', startedAt: '2026-03-17T14:00:00.000Z', finishedAt: '2026-03-17T14:30:00.000Z', name: 'Run', notes: null, exercises: [{ name: 'Morning Jog', category: 'Cardio', superset: null, sets: [set(null, null, { seconds: 1800, distanceM: 5000 })] }] },
  ];
  const preview = await u.call('POST', '/api/import/workouts', { format: 'strong', workouts, dryRun: true });
  assert.equal(preview.status, 200, preview.text);
  assert.equal(preview.body.workouts, 2);
  assert.equal(preview.body.sets, 5);
  assert.ok(preview.body.matched.some((m: { from: string }) => m.from === 'Bench Press (Barbell)'), JSON.stringify(preview.body.matched));
  assert.deepEqual(preview.body.added.sort(), ['Morning Jog', 'Zercher Carry Thing']);
  assert.equal((await u.call('GET', '/api/workouts?limit=10')).body.workouts.length, 0, 'a preview saves nothing');
  const done = await u.call('POST', '/api/import/workouts', { format: 'strong', workouts, dryRun: false });
  assert.equal(done.status, 200, done.text);
  const list = (await u.call('GET', '/api/workouts?limit=10')).body.workouts as { id: string; name: string; finishedAt: string | null }[];
  assert.deepEqual(list.map((w) => w.name).sort(), ['Push Day', 'Run']);
  assert.ok(list.every((w) => w.finishedAt), 'imported finished');
  const push = (await u.call('GET', `/api/workouts/${list.find((w) => w.name === 'Push Day')!.id}`)).body.workout;
  assert.deepEqual(push.exercises[0].sets.map((s: { warmup: boolean; drop: boolean; done: boolean }) => [s.warmup, s.drop, s.done]), [[true, false, true], [false, false, true], [false, true, true]]);
  const mine = (await u.call('GET', '/api/exercises')).body.exercises as { name: string; kind: string }[];
  assert.equal(mine.find((e) => e.name === 'Morning Jog')?.kind, 'cardio', 'a new exercise gets its kind from its sets');
  const again = await u.call('POST', '/api/import/workouts', { format: 'strong', workouts, dryRun: false });
  assert.equal(again.body.workouts, 0);
  assert.equal(again.body.skipped, 2, 'the same file twice adds nothing');
});
