import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import * as oidc from 'openid-client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from '@forkbell/db';
import { BUILD } from '@forkbell/shared';
import { z } from 'zod';
import { env } from './env.ts';
import { USERNAME, decoyHash, hashPassword, lockedFor, noteFailure, noteSuccess, passwordProblem, verifyPassword } from './password.ts';

/** userId: who is signed in. profileId: whose data this request is about (theirs, or someone who shared with them). */
export type AppEnv = { Variables: { userId: string; profileId: string; tokenHash: string } };

const COOKIE = 'fb_session';
const NATIVE_REDIRECT = 'forkbell://auth';
/** Shortcut keys start with this, and only work on /api/shortcuts. */
export const SHORTCUT_PREFIX = 'fbk_';

/**
 * Where to send the phone app after sign-in. Only the app's own scheme, plus
 * Expo Go's exp:// links while developing, so a sign-in code can't be sent
 * anywhere else.
 */
function nativeReturn(requested: string | undefined) {
  if (!requested) return NATIVE_REDIRECT;
  if (requested.startsWith('forkbell://')) return requested;
  if (process.env.NODE_ENV !== 'production' && requested.startsWith('exp://')) return requested;
  return NATIVE_REDIRECT;
}

/** Session tokens are random; only an HMAC of them is stored. */
export const hashToken = (token: string) => createHmac('sha256', env.sessionSecret).update(token).digest('base64url');

// Short-lived, in-memory: a login in progress and native hand-off codes.
// Fine for a single server process; move to Postgres if you ever run several.
type Pending = { verifier: string; platform: 'web' | 'native'; returnTo: string; expires: number };
const pending = new Map<string, Pending>();
const handoff = new Map<string, { token: string; expires: number }>();

/**
 * Sign-in codes: a device that's signed in shows one ("Sign in another
 * device"), and the new device types it. Eight letters and digits without
 * look-alikes (about 40 bits), five minutes, one use, one per person at a
 * time, kept only as a hash. Wrong guesses are limited per address.
 */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_MINUTES = 5;
const linkCodes = new Map<string, { userId: string; expires: number }>();
const codeMisses = new Map<string, { n: number; until: number }>();
export function newSignInCode(userId: string) {
  for (const [k, v] of linkCodes) if (v.userId === userId || v.expires < Date.now()) linkCodes.delete(k);
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
  const expires = Date.now() + CODE_MINUTES * 60_000;
  linkCodes.set(hashToken(`code:${code}`), { userId, expires });
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: new Date(expires).toISOString() };
}
const tidyCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1');

const sweep = () => {
  const now = Date.now();
  for (const [k, v] of linkCodes) if (v.expires < now) linkCodes.delete(k);
  for (const [k, v] of codeMisses) if (v.until < now) codeMisses.delete(k);
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  for (const [k, v] of handoff) if (v.expires < now) handoff.delete(k);
};

let configPromise: Promise<oidc.Configuration> | null = null;
function oidcConfig() {
  const o = env.oidc!;
  configPromise ??= oidc.discovery(new URL(o.issuer), o.clientId, o.clientSecret).catch((err) => {
    configPromise = null; // retry discovery next time
    throw err;
  });
  return configPromise;
}

const callbackUrl = `${env.publicUrl}/auth/callback`;

/** A short description of where a sign-in came from, for the list of your devices. */
export function describeDevice(userAgent: string | undefined, platform: 'web' | 'native') {
  const ua = userAgent ?? '';
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone|iOS|Darwin/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux|CrOS/.test(ua) ? 'Linux' : null;
  if (platform === 'native') return `Forkbell app${os ? ` on ${os}` : ''}`;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

/** A new signed-in session; returns the token (only its hash is stored). */
async function startSession(db: Database, userId: string, method: 'sso' | 'password' | 'code', device: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + env.sessionDays * 86_400_000);
  const hash = hashToken(token);
  await db.execute(sql`select auth_create_session(${userId}::uuid, ${hash}, ${expires.toISOString()}::timestamptz)`);
  await db.execute(sql`select auth_tag_session(${hash}, ${method}, ${device})`);
  return { token, expires };
}

/** The address a request came from. Behind Traefik that's the last X-Forwarded-For hop. */
function clientIp(header: (name: string) => string | undefined) {
  const xff = header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean);
  return xff?.at(-1) ?? header('x-real-ip') ?? 'direct';
}

const credentials = z.object({
  username: z.string().trim().toLowerCase().max(64),
  password: z.string().max(500),
  platform: z.enum(['web', 'native']).default('web'),
});

/** Sign-up is open when the server says so, or when it has nobody yet (the first account). */
async function signupMode(db: Database) {
  if (!env.password.enabled) return 'off';
  if (env.password.signup !== 'off') return env.password.signup;
  const [row] = await db.execute<{ n: string }>(sql`select auth_user_count() as n`);
  return Number(row?.n ?? 1) === 0 ? 'open' : 'off';
}

export function authRoutes(db: Database) {
  const r = new Hono();

  /** How to sign in to this server, and what version it is. Public: the sign-in screen asks before anyone has signed in. */
  r.get('/methods', async (c) => {
    c.header('cache-control', 'no-store');
    return c.json({
      server: BUILD,
      sso: env.oidc ? { name: env.oidc.name } : null,
      password: env.password.enabled ? { signup: await signupMode(db) } : null,
    });
  });

  /** Hands out a session: a cookie on the web, the token itself to the phone app. */
  const finish = (c: Context, platform: 'web' | 'native', s: { token: string; expires: Date }) => {
    if (platform === 'native') return c.json({ token: s.token });
    setCookie(c, COOKIE, s.token, { httpOnly: true, secure: env.secureCookies, sameSite: 'Lax', path: '/', expires: s.expires });
    return c.json({ ok: true });
  };

  r.post('/password/login', async (c) => {
    if (!env.password.enabled) return c.json({ error: 'This server doesn’t use passwords. Sign in with single sign-on.' }, 404);
    const parsed = credentials.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !parsed.data.username || !parsed.data.password) return c.json({ error: 'Enter your username and password.' }, 400);
    const { username, password, platform } = parsed.data;
    const ip = clientIp((n) => c.req.header(n));
    const wait = lockedFor(username, ip);
    if (wait) return c.json({ error: `Too many wrong passwords. Try again in ${wait} minute${wait === 1 ? '' : 's'}.` }, 429);

    const [row] = await db.execute<{ user_id: string; password_hash: string }>(sql`select * from auth_password_lookup(${username})`);
    const ok = await verifyPassword(password, row?.password_hash ?? (await decoyHash()));
    if (!row || !ok) {
      noteFailure(username, ip);
      return c.json({ error: 'That username and password don’t match.' }, 401);
    }
    noteSuccess(username);
    return finish(c, platform, await startSession(db, row.user_id, 'password', describeDevice(c.req.header('user-agent'), platform)));
  });

  r.post('/password/signup', async (c) => {
    const mode = await signupMode(db);
    if (mode === 'off') return c.json({ error: 'This server isn’t taking new accounts. Ask whoever runs it.' }, 403);
    const parsed = credentials
      .extend({ name: z.string().trim().max(80).optional(), code: z.string().max(200).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Check your details and try again.' }, 400);
    const { username, password, platform, name, code } = parsed.data;
    const ip = clientIp((n) => c.req.header(n));
    if (lockedFor('#signup-code', ip)) return c.json({ error: 'Too many tries from here. Wait a few minutes.' }, 429);
    if (mode === 'code' && !sameSecret(code ?? '', env.password.signupCode)) {
      noteFailure('#signup-code', ip);
      return c.json({ error: 'That sign-up code isn’t right.' }, 403);
    }
    if (!USERNAME.test(username)) return c.json({ error: 'Usernames are 3 to 32 letters, numbers, dots, dashes or underscores.' }, 400);
    const problem = passwordProblem(password, username);
    if (problem) return c.json({ error: problem }, 400);
    const [row] = await db.execute<{ id: string | null }>(sql`select auth_password_signup(${username}, ${await hashPassword(password)}, ${name || username}) as id`);
    if (!row?.id) return c.json({ error: 'That username is taken. Pick another.' }, 409);
    return finish(c, platform, await startSession(db, row.id, 'password', describeDevice(c.req.header('user-agent'), platform)));
  });

  r.get('/login', async (c) => {
    if (!env.oidc) return c.json({ error: 'Single sign-on is off on this server. Sign in with your username and password.' }, 404);
    sweep();
    const config = await oidcConfig();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const platform = c.req.query('platform') === 'native' ? 'native' : 'web';
    pending.set(state, { verifier, platform, returnTo: nativeReturn(c.req.query('redirect')), expires: Date.now() + 10 * 60_000 });
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: 'openid profile email',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
    });
    return c.redirect(url.href);
  });

  r.get('/callback', async (c) => {
    if (!env.oidc) return c.text('Single sign-on is off on this server.', 404);
    const state = c.req.query('state') ?? '';
    const login = pending.get(state);
    pending.delete(state);
    if (!login || login.expires < Date.now()) return c.text('This sign-in link expired. Go back to Forkbell and sign in again.', 400);

    const config = await oidcConfig();
    // Rebuild the URL from PUBLIC_URL: behind a reverse proxy the request's own host is internal.
    const current = new URL(`${callbackUrl}${new URL(c.req.url).search}`);
    const tokens = await oidc.authorizationCodeGrant(config, current, { pkceCodeVerifier: login.verifier, expectedState: state });
    const claims = tokens.claims();
    if (!claims?.sub) return c.text('The sign-in provider did not say who you are.', 400);

    const name = (claims.name ?? claims.preferred_username ?? null) as string | null;
    const email = (claims.email ?? null) as string | null;
    const [row] = await db.execute<{ id: string }>(
      sql`select auth_upsert_user(${claims.iss}, ${claims.sub}, ${email}, ${name}) as id`,
    );
    const userId = row!.id;
    const { token, expires } = await startSession(db, userId, 'sso', describeDevice(c.req.header('user-agent'), login.platform));

    if (login.platform === 'native') {
      // The app exchanges this one-time code for the token, so the token never sits in a URL.
      const code = randomBytes(24).toString('base64url');
      handoff.set(code, { token, expires: Date.now() + 60_000 });
      return c.redirect(`${login.returnTo}?code=${code}`);
    }
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      secure: env.secureCookies,
      sameSite: 'Lax',
      path: '/',
      expires,
    });
    return c.redirect(env.appUrl);
  });

  /** Sign in with a code shown on a device that's already signed in. */
  r.post('/code', async (c) => {
    sweep();
    const parsed = z.object({ code: z.string().max(40), platform: z.enum(['web', 'native']).default('web') }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Type the code from your other device.' }, 400);
    const ip = clientIp((n) => c.req.header(n));
    const miss = codeMisses.get(ip);
    if (miss && miss.n >= 10 && miss.until > Date.now()) return c.json({ error: 'Too many wrong codes. Try again in 15 minutes.' }, 429);
    // Codes never use O or I, so someone typing those meant 0 and 1.
    const key = hashToken(`code:${tidyCode(parsed.data.code)}`);
    const hit = linkCodes.get(key);
    if (!hit || hit.expires < Date.now()) {
      codeMisses.set(ip, { n: (miss && miss.until > Date.now() ? miss.n : 0) + 1, until: Date.now() + 15 * 60_000 });
      return c.json({ error: 'That code didn’t work. Codes last 5 minutes and work once; make a new one on your other device.' }, 401);
    }
    linkCodes.delete(key);
    return finish(c, parsed.data.platform, await startSession(db, hit.userId, 'code', describeDevice(c.req.header('user-agent'), parsed.data.platform)));
  });

  r.post('/exchange', async (c) => {
    sweep();
    const { code } = await c.req.json<{ code?: string }>().catch(() => ({ code: undefined }));
    const hit = code ? handoff.get(code) : undefined;
    if (code) handoff.delete(code);
    if (!hit || hit.expires < Date.now()) return c.json({ error: 'Sign-in code expired. Sign in again.' }, 400);
    return c.json({ token: hit.token });
  });

  r.post('/logout', async (c) => {
    const token = readToken(c.req.header('authorization'), getCookie(c, COOKIE));
    if (token) await db.execute(sql`select auth_end_session(${hashToken(token)})`);
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return r;
}

/** Compare two secrets without leaking how much of them matched. */
function sameSecret(a: string, b: string) {
  const x = createHmac('sha256', env.sessionSecret).update(a).digest();
  const y = createHmac('sha256', env.sessionSecret).update(b).digest();
  return b.length > 0 && timingSafeEqual(x, y);
}

function readToken(authorization: string | undefined, cookie: string | undefined) {
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return cookie ?? null;
}

export function requireUser(db: Database): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readToken(c.req.header('authorization'), getCookie(c, COOKIE));
    if (!token) return c.json({ error: 'Sign in to continue.' }, 401);
    // A Shortcut key can ask Bell and log what you confirm, nothing else, and can't make more keys.
    if (token.startsWith(SHORTCUT_PREFIX) && (!c.req.path.startsWith('/api/shortcuts/') || c.req.path.startsWith('/api/shortcuts/keys')))
      return c.json({ error: 'A Shortcut key only works for Siri and Shortcuts.' }, 403);
    const tokenHash = hashToken(token);
    const [row] = await db.execute<{ id: string | null }>(sql`select auth_session_user(${tokenHash}) as id`);
    if (!row?.id) return c.json({ error: 'Your session ended. Sign in again.' }, 401);
    c.set('userId', row.id);
    c.set('tokenHash', tokenHash);
    await next();
  };
}
