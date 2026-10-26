// Username + password sign-in, alongside (or instead of) Authelia.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { BASE, caller, newUser, startServer, stopServer } from './harness.ts';

const CODE = 'let-me-in-please';
const anon = caller(null);
const name = () => `u${randomBytes(4).toString('hex')}`;
const PW = 'correct horse battery';

before(() => startServer({ PASSWORD_LOGIN: 'on', PASSWORD_SIGNUP: 'code', SIGNUP_CODE: CODE }));
after(stopServer);

async function signUp(username = name(), password = PW) {
  const r = await anon('POST', '/auth/password/signup', { username, password, code: CODE, platform: 'native' });
  assert.equal(r.status, 200, r.text);
  return { username, token: r.body.token as string, call: caller(r.body.token) };
}

test('the sign-in screen can ask how to sign in, and which version this is', async () => {
  const r = await anon('GET', '/auth/methods');
  assert.equal(r.status, 200);
  assert.equal(r.body.sso.name, 'Authelia');
  assert.equal(r.body.password.signup, 'code');
  assert.match(r.body.server.version, /^\d+\.\d+\.\d+$/);
  const h = await fetch(`${BASE}/healthz`);
  assert.match(h.headers.get('x-forkbell-version') ?? '', /^\d+\.\d+\.\d+/);
  assert.equal((await h.json()).version, r.body.server.version);
});

test('sign up with the code, then sign in on the web and on the phone', async () => {
  assert.equal((await anon('POST', '/auth/password/signup', { username: name(), password: PW, code: 'wrong-code' })).status, 403);
  const u = await signUp();
  assert.equal((await u.call('GET', '/api/me')).status, 200);

  const phone = await anon('POST', '/auth/password/login', { username: u.username.toUpperCase(), password: PW, platform: 'native' });
  assert.equal(phone.status, 200);
  assert.ok(phone.body.token);

  const web = await fetch(`${BASE}/auth/password/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u.username, password: PW }) });
  assert.equal(web.status, 200);
  const cookie = web.headers.get('set-cookie') ?? '';
  assert.match(cookie, /fb_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.equal((await web.json()).token, undefined, 'the web never gets the token itself');
});

test('wrong passwords and unknown usernames look the same, and guessing gets locked out', async () => {
  const u = await signUp();
  const wrong = await anon('POST', '/auth/password/login', { username: u.username, password: 'nope nope nope' });
  const missing = await anon('POST', '/auth/password/login', { username: name(), password: 'nope nope nope' });
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.equal(wrong.body.error, missing.body.error);
  let last = wrong;
  for (let i = 0; i < 9; i++) last = await anon('POST', '/auth/password/login', { username: u.username, password: `guess ${i} guess` });
  assert.equal(last.status, 429);
  // Even the right password waits.
  assert.equal((await anon('POST', '/auth/password/login', { username: u.username, password: PW })).status, 429);
});

test('weak passwords and taken usernames are refused', async () => {
  const u = await signUp();
  for (const password of ['short', 'aaaaaaaaaaaa', '1234567890abc']) {
    assert.equal((await anon('POST', '/auth/password/signup', { username: name(), password, code: CODE })).status, 400, password);
  }
  const sameName = name();
  assert.equal((await anon('POST', '/auth/password/signup', { username: sameName, password: `${sameName}12345678`, code: CODE })).status, 400);
  assert.equal((await anon('POST', '/auth/password/signup', { username: u.username, password: PW, code: CODE })).status, 409);
  assert.equal((await anon('POST', '/auth/password/signup', { username: 'no spaces!', password: PW, code: CODE })).status, 400);
});

test('an Authelia account can add a password, and then sign in with either', async () => {
  const sso = await newUser('SSO person');
  const before = await sso.call('GET', '/api/me/security');
  assert.equal(before.status, 200);
  assert.equal(before.body.accountKind, 'sso');
  assert.equal(before.body.username, null);

  const username = name();
  assert.equal((await sso.call('PUT', '/api/me/security/password', { username, password: PW })).status, 200);
  const login = await anon('POST', '/auth/password/login', { username, password: PW, platform: 'native' });
  assert.equal(login.status, 200);
  const viaPw = caller(login.body.token);
  assert.equal((await viaPw("GET", "/api/me")).body.id, sso.id);

  assert.equal((await viaPw('GET', '/api/me')).body.id, sso.id);
  assert.equal((await sso.call('PUT', '/api/me/security/password', { username, password: 'another long password' })).status, 403);
  assert.equal((await sso.call('PUT', '/api/me/security/password', { username, password: 'another long password', current: PW })).status, 200);
  // ...and signs out everywhere else.
  assert.equal((await viaPw('GET', '/api/me')).status, 401);
  assert.equal((await sso.call('GET', '/api/me')).status, 200);

  assert.equal((await sso.call('DELETE', '/api/me/security/password')).status, 200);
  assert.equal((await anon('POST', '/auth/password/login', { username, password: 'another long password' })).status, 401);
});

test('a password account can’t remove its only password, and can’t take a taken username', async () => {
  const a = await signUp();
  const b = await signUp();
  assert.equal((await a.call('DELETE', '/api/me/security/password')).status, 400);
  assert.equal((await a.call('PUT', '/api/me/security/password', { username: b.username, password: 'fresh long password', current: PW })).status, 409);
  const sec = await a.call('GET', '/api/me/security');
  assert.equal(sec.body.accountKind, 'password');
  assert.equal(sec.body.username, a.username);
});

test('see where you’re signed in, end one, or end all the others', async () => {
  const u = await signUp();
  const other = await anon('POST', '/auth/password/login', { username: u.username, password: PW, platform: 'native' });
  const third = await anon('POST', '/auth/password/login', { username: u.username, password: PW, platform: 'native' });
  const list = await u.call('GET', '/api/me/security');
  assert.equal(list.body.sessions.length, 3);
  assert.equal(list.body.sessions.filter((s: { current: boolean }) => s.current).length, 1);
  assert.ok(list.body.sessions.every((s: { method: string }) => s.method === 'password'));

  const me = list.body.sessions.find((s: { current: boolean }) => s.current);
  assert.equal((await u.call('DELETE', `/api/me/security/sessions/${me.id}`)).status, 400, 'not this device');
  const one = list.body.sessions.find((s: { current: boolean }) => !s.current);
  assert.equal((await u.call('DELETE', `/api/me/security/sessions/${one.id}`)).status, 200);
  assert.equal((await u.call('GET', '/api/me/security')).body.sessions.length, 2);

  const ended = await u.call('POST', '/api/me/security/sessions/sign-out-others', {});
  assert.equal(ended.body.signedOut, 1);
  assert.equal((await caller(other.body.token)('GET', '/api/me')).status, 401);
  assert.equal((await caller(third.body.token)('GET', '/api/me')).status, 401);
  assert.equal((await u.call('GET', '/api/me')).status, 200);
});

test('someone else’s sign-ins can’t be seen or ended', async () => {
  const a = await signUp();
  const b = await signUp();
  const bs = (await b.call('GET', '/api/me/security')).body.sessions[0];
  assert.equal((await a.call('DELETE', `/api/me/security/sessions/${bs.id}`)).status, 404);
  assert.equal((await b.call('GET', '/api/me')).status, 200);
  assert.ok((await a.call('GET', '/api/me/security')).body.sessions.every((s: { id: string }) => s.id !== bs.id));
});
