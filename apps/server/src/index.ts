import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { connect } from '@forkbell/db';
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

const database = connect(env.databaseUrl);
const app = new Hono();

app.use('*', secureHeaders());
// Only needed in development, when Expo's web server runs on another port.
if (env.appUrl !== env.publicUrl) app.use('/api/*', cors({ origin: env.appUrl, credentials: true }));

app.get('/healthz', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes(database.db));

const api = new Hono<AppEnv>();
api.use('*', requireUser(database.db));
api.route('/me', meRoutes(database));
api.route('/diary', diaryRoutes(database));
api.route('/foods', foodRoutes(database));
api.route('/exercises', exerciseRoutes(database));
api.route('/workouts', workoutRoutes(database));
api.route('/programs', programRoutes(database));
api.route('/routines', routineRoutes(database));
api.route('/progress', progressRoutes(database));
api.route('/health', healthRoutes(database));
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
    .map((f) => '/' + path.relative(root, path.join(f.parentPath, f.name)).split(path.sep).join('/'));
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

serve({ fetch: app.fetch, port: env.port }, (info) => console.log(`Forkbell server on :${info.port}`));
