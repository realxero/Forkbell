import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { connect, withRequestUser } from '@forkbell/db';
import { sql } from 'drizzle-orm';
import { env } from './env.ts';
import { authRoutes, requireUser, type AppEnv } from './auth.ts';
import { diaryRoutes } from './routes/diary.ts';
import { foodRoutes } from './routes/foods.ts';
import { meRoutes } from './routes/me.ts';
import { exerciseRoutes } from './routes/exercises.ts';
import { workoutRoutes } from './routes/workouts.ts';
import { programRoutes, routineRoutes } from './routes/programs.ts';
import { progressRoutes } from './routes/progress.ts';
import { healthRoutes } from './routes/health.ts';
import { bellRoutes } from './routes/bell.ts';
import { mediaRoutes, prefetchPictures } from './media.ts';
import { shareRoutes } from './routes/shares.ts';
import { mealRoutes, recipeRoutes } from './routes/meals.ts';
import { aiRoutes } from './routes/ai.ts';
import { wellbeingRoutes } from './routes/wellbeing.ts';
import { stretchRoutes } from './routes/stretches.ts';
import { exportRoutes } from './routes/export.ts';
import { shortcutRoutes } from './routes/shortcuts.ts';

const database = connect(env.databaseUrl);
const app = new Hono();

app.use('*', secureHeaders());
// Only needed in development, when Expo's web server runs on another port.
if (env.appUrl !== env.publicUrl) app.use('/api/*', cors({ origin: env.appUrl, credentials: true }));

app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes(database.db));

// Exercise pictures: public, so they're mounted before the signed-in API.
app.route('/api/media', mediaRoutes());

const api = new Hono<AppEnv>();
api.use('*', requireUser(database.db));

// Viewing someone who shared with you: which routes allow it, and with which permission.
const SHAREABLE: [prefix: string, read: string, write: string | null][] = [
  ['/api/diary', 'food_read', 'food_write'],
  ['/api/foods', 'food_read', 'food_write'],
  ['/api/meals', 'food_read', 'food_write'],
  ['/api/recipes', 'food_read', 'food_write'],
  ['/api/workouts', 'training_read', null],
  ['/api/exercises', 'training_read', null],
  ['/api/programs', 'training_read', null],
  ['/api/routines', 'training_read', null],
  ['/api/progress', 'progress_read', null],
  ['/api/wellbeing', 'wellbeing_read', null],
];
api.use('*', async (c, next) => {
  const userId = c.get('userId');
  const want = c.req.header('x-forkbell-profile');
  const rule = SHAREABLE.find(([p]) => c.req.path === p || c.req.path.startsWith(`${p}/`));
  let profileId = userId;
  // Anything else (your account, Bell, sharing itself) is always about you.
  if (want && want !== userId && rule) {
    if (!/^[0-9a-f-]{36}$/i.test(want)) return c.json({ error: 'Unknown profile.' }, 400);
    const perm = c.req.method === 'GET' ? rule[1] : rule[2];
    if (!perm) return c.json({ error: 'You can view this, but only they can change it.' }, 403);
    const ok = await withRequestUser(userId, () =>
      database.asUser(want, async (tx) => ((await tx.execute(sql`select may(${perm}) as ok`)) as unknown as { ok: boolean }[])[0]?.ok === true),
    );
    if (!ok) return c.json({ error: 'They haven’t shared this with you.' }, 403);
    profileId = want;
  }
  c.set('profileId', profileId);
  return withRequestUser(userId, () => next());
});
api.route('/me', meRoutes(database));
api.route('/diary', diaryRoutes(database));
api.route('/foods', foodRoutes(database));
api.route('/exercises', exerciseRoutes(database));
api.route('/workouts', workoutRoutes(database));
api.route('/programs', programRoutes(database));
api.route('/routines', routineRoutes(database));
api.route('/progress', progressRoutes(database));
api.route('/health', healthRoutes(database));
api.route('/shares', shareRoutes(database));
api.route('/meals', mealRoutes(database));
api.route('/ai', aiRoutes(database));
api.route('/recipes', recipeRoutes(database));
api.route('/wellbeing', wellbeingRoutes(database));
api.route('/stretches', stretchRoutes());
api.route('/export', exportRoutes(database));

// Bell reads data through the same routes as the app, as the signed-in person.
// This copy of the API is never served; only Bell's tools call it, in-process.
const internalApi = new Hono<AppEnv>();
internalApi.use('*', async (c, next) => {
  c.set('userId', c.req.header('x-forkbell-user')!);
  c.set('profileId', c.req.header('x-forkbell-user')!);
  await next();
});
internalApi.route('/api/diary', diaryRoutes(database));
internalApi.route('/api/foods', foodRoutes(database));
internalApi.route('/api/exercises', exerciseRoutes(database));
internalApi.route('/api/workouts', workoutRoutes(database));
internalApi.route('/api/progress', progressRoutes(database));
const internal = async (path: string, userId: string, init?: { method: string; body: unknown }) => {
  const res = await internalApi.request(path, {
    method: init?.method ?? 'GET',
    headers: { 'x-forkbell-user': userId, ...(init ? { 'content-type': 'application/json' } : {}) },
    ...(init ? { body: JSON.stringify(init.body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
};
api.route('/bell', bellRoutes(database, internal));
// Siri and Shortcuts ask Bell through this in-process copy, as the key's owner.
internalApi.route('/api/bell', bellRoutes(database, internal));
api.route('/shortcuts', shortcutRoutes(database, internal));
app.route('/api', api);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Something went wrong on the server. Check its log.' }, 500);
});

// The exported web app, served from the same origin so sign-in cookies just work.
if (env.webDir) {
  const root = path.resolve(env.webDir);
  // Every file of the web app, so the service worker can keep all of it for offline use.
  const assets = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((f) => f.isFile() && !f.name.endsWith('.map') && f.name !== 'sw.js')
    .map((f) => '/' + path.relative(root, path.join(f.parentPath, f.name)).split(path.sep).join('/'))
    // The Form check page (with ~20 MB of pose model code) loads only when you use it.
    .filter((p) => !p.startsWith('/form/'));
  app.get('/sw-assets.json', (c) => {
    c.header('cache-control', 'no-store');
    return c.json(assets);
  });
  // The service worker must never be cached by the browser, or updates stall.
  const sw = await readFile(path.join(root, 'sw.js'), 'utf8').catch(() => null);
  if (sw)
    app.get('/sw.js', (c) => {
      c.header('cache-control', 'no-store');
      c.header('content-type', 'text/javascript; charset=utf-8');
      return c.body(sw);
    });
  app.use('*', serveStatic({ root }));
  const index = await readFile(path.join(root, 'index.html'), 'utf8');
  app.get('*', (c) => c.html(index)); // client-side routes
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Forkbell server on :${info.port}`);
  // Not essential, and never in the way: errors are logged and the server carries on.
  void prefetchPictures().catch((e) => console.error('exercise pictures:', e));
});
