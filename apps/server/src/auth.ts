import { Hono, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import * as oidc from 'openid-client';
import { createHmac, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from '@forkbell/db';
import { env } from './env.ts';

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
const sweep = () => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  for (const [k, v] of handoff) if (v.expires < now) handoff.delete(k);
};

let configPromise: Promise<oidc.Configuration> | null = null;
function oidcConfig() {
  configPromise ??= oidc.discovery(new URL(env.oidc.issuer), env.oidc.clientId, env.oidc.clientSecret).catch((err) => {
    configPromise = null; // retry discovery next time
    throw err;
  });
  return configPromise;
}

const callbackUrl = `${env.publicUrl}/auth/callback`;

export function authRoutes(db: Database) {
  const r = new Hono();

  r.get('/login', async (c) => {
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

    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + env.sessionDays * 86_400_000);
    await db.execute(sql`select auth_create_session(${userId}::uuid, ${hashToken(token)}, ${expires.toISOString()}::timestamptz)`);

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
