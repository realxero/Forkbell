// Regression tests for the API, against a real server and database. They pin
// down behaviour that broke (or nearly did) before, so it can't quietly come back.
//   DATABASE_ADMIN_URL=... DATABASE_URL=... pnpm --filter @forkbell/server test:api
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caller, newUser, serverLog, startServer, stopServer } from './harness.ts';

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
