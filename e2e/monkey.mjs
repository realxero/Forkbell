// Monkey test: a signed-in browser (phone-sized) visits every screen of the
// Forkbell web app and does random things: taps whatever is tappable, types
// junk into boxes, scrolls, goes back. Anything that crashes the page, logs an
// error, gets a server error, or lands on a missing screen is reported.
//
// Needs a running Forkbell server that serves the web app (WEB_DIR) on a
// migrated database:
//   BASE_URL=http://localhost:3999 SESSION_SECRET=... DATABASE_ADMIN_URL=... node monkey.mjs
// MONKEY_SEED=<n> replays the exact same run; MONKEY_STEPS sets actions per screen.
import { chromium } from 'playwright';
import postgres from 'postgres';
import { createHmac, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3999').replace(/\/$/, '');
const SECRET = process.env.SESSION_SECRET;
const ADMIN = process.env.DATABASE_ADMIN_URL;
const SEED = Number(process.env.MONKEY_SEED ?? Date.now() % 1_000_000);
const STEPS = Number(process.env.MONKEY_STEPS ?? 40);
if (!SECRET || !ADMIN) {
  console.error('Set SESSION_SECRET (the server’s) and DATABASE_ADMIN_URL.');
  process.exit(2);
}

// Every screen, and a few with the query parameters other screens send.
const ROUTES = [
  '/', '/train', '/progress', '/bell', '/settings',
  '/add', '/add?meal=lunch&scan=1', '/weigh', '/weigh?meal=dinner', '/scan', '/stretches', '/stretches?kind=static&muscles=quads,hamstrings',
  '/exercises', '/programs', '/plan', '/recipes', '/shopping', '/medications', '/preferences', '/sharing', '/photos',
  '/setting/goals', '/setting/appearance', '/setting/bell', '/setting/health', '/setting/phone', '/setting/data', '/setting/shortcuts', '/setting/nope',
  '/bell?ask=how%20much%20protein%20is%20left',
];
const DANGER = /sign ?out|log ?out/i;
const JUNK = ['182', '8:30 pm', '25:99', '0', '-5', '1e9', '', ' ', 'chicken and rice', '🍕🍕🍕', "'; drop table foods; --", 'x'.repeat(500), '½ cup', 'NaN'];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const r = rng(SEED);
const pick = (xs) => xs[Math.floor(r() * xs.length)];
const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// A fresh user with a session, set up so the app opens straight to its screens.
async function signIn() {
  const sql = postgres(ADMIN, { max: 1, onnotice: () => {} });
  const tag = `monkey-${Date.now()}`;
  const [{ id }] = await sql`select auth_upsert_user(${tag}, 'monkey', null, 'Monkey') as id`;
  const token = randomBytes(32).toString('base64url');
  const hash = createHmac('sha256', SECRET).update(token).digest('base64url');
  await sql`select auth_create_session(${id}::uuid, ${hash}, ${new Date(Date.now() + 86_400_000).toISOString()}::timestamptz)`;
  await sql.end();
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const me = await call('GET', '/api/me');
  await call('PUT', '/api/me/preferences', { ...me.preferences, onboarded: true, containers: [{ id: 'plate', name: 'Big plate', grams: 410 }] });
  await call('PUT', '/api/me/goals', { kcal: 2400, protein: 160, carbs: 250, fat: 80 }).catch(() => {});
  // Something on the screens, so there's more to poke.
  const food = { name: 'Monkey oats', brand: null, source: 'custom', sourceId: null, per100: { kcal: 380, protein: 13, carbs: 67, fat: 7 }, servingGrams: null, servingLabel: null, barcode: null, portions: [] };
  const today = new Date().toISOString().slice(0, 10);
  await call('POST', '/api/diary', { date: today, meal: 'breakfast', grams: 50, food }).catch(() => {});
  await call('POST', '/api/wellbeing/medications', { name: 'Vitamin D', dose: '1000 IU', timesPerDay: 2, notes: null, reminderTimes: ['08:00', ''] }).catch(() => {});
  return token;
}

const problems = [];
let where = '';
const report = (kind, text) => {
  const line = `${kind} on ${where}: ${String(text).slice(0, 400)}`;
  if (!problems.some((p) => p.line === line)) problems.push({ kind, route: where, text: String(text).slice(0, 2000), line });
};

const token = await signIn();
// CHROMIUM_PATH: use a browser that's already installed instead of Playwright's own.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
await context.addCookies([{ name: 'fb_session', value: token, url: BASE }]);
// Stay on Forkbell: nothing leaves for other sites.
await context.route('**/*', (route) => {
  const url = route.request().url();
  return url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:') ? route.continue() : route.abort();
});
const page = await context.newPage();
page.on('pageerror', (e) => report('crash', e.stack || e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|net::ERR_|ERR_FAILED|favicon|speech|getUserMedia|NotAllowedError|camera/i.test(t)) return;
  report('console error', t);
});
page.on('response', (res) => {
  const url = res.url();
  // 502/503 are expected without an AI key (Bell, and recipe import, which uses Bell) or with
  // the picture source or a recipe's web page unreachable; the app shows those as messages.
  if (res.status() >= 500 && !(res.status() >= 502 && /\/api\/(bell|media|recipes\/import)\//.test(url))) report(`server ${res.status()}`, `${res.request().method()} ${url}`);
});
page.on('dialog', (d) => d.dismiss().catch(() => {}));

async function visible(selector) {
  const out = [];
  for (const el of await page.$$(selector)) {
    try {
      if (!(await el.isVisible())) continue;
      const label = `${(await el.getAttribute('aria-label')) ?? ''} ${(await el.innerText().catch(() => '')) ?? ''}`;
      if (DANGER.test(label)) continue;
      out.push(el);
    } catch {
      /* gone already */
    }
  }
  return out;
}

async function home(route) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch((e) => report('navigation', e.message));
  await page.waitForTimeout(900);
}

const started = Date.now();
for (const route of ROUTES) {
  where = route;
  await home(route);
  const body = await page.innerText('body').catch(() => '');
  if (/Unmatched Route|This screen doesn.t exist|Page not found/i.test(body) && route !== '/setting/nope') report('missing screen', route);
  for (let step = 0; step < STEPS; step++) {
    const roll = r();
    try {
      if (roll < 0.55) {
        const els = await visible('[role=button],[role=tab],[role=switch],[role=checkbox],[role=link],a[href],[tabindex="0"]');
        if (els.length) await pick(els).click({ timeout: 1500 });
      } else if (roll < 0.75) {
        const els = await visible('input:not([type=checkbox]):not([type=file]),textarea');
        if (els.length) {
          const el = pick(els);
          await el.fill(pick(JUNK), { timeout: 1500 });
          if (r() < 0.4) await el.press('Enter');
        }
      } else if (roll < 0.9) {
        await page.mouse.wheel(0, int(-900, 900));
      } else if (roll < 0.95) {
        await page.keyboard.press('Escape');
      } else {
        await page.goBack({ timeout: 3000 }).catch(() => {});
      }
    } catch {
      // Detached, covered or animating: a monkey's tap just misses. Not a problem.
    }
    await page.waitForTimeout(int(60, 220));
    if (!page.url().startsWith(BASE)) await home(route);
  }
}
await browser.close();

const summary = { seed: SEED, stepsPerScreen: STEPS, screens: ROUTES.length, seconds: Math.round((Date.now() - started) / 1000), problems };
await writeFile(new URL('./monkey-report.json', import.meta.url), JSON.stringify(summary, null, 2));
if (problems.length) {
  console.error(`Monkey test found ${problems.length} problem(s). Replay with MONKEY_SEED=${SEED}.\n`);
  for (const p of problems) console.error(`- ${p.line}\n`);
  process.exit(1);
}
console.log(`Monkey test: ${ROUTES.length} screens × ${STEPS} random actions, no problems (seed ${SEED}, ${summary.seconds} s).`);
