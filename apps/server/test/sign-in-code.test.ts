// Signing in another device with a one-time code from one that's signed in.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, newUser, startServer, stopServer } from './harness.ts';

before(() => startServer());
after(() => stopServer());

const useCode = (code: string, platform = 'native') =>
  fetch(`${BASE}/auth/code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, platform }) });

test('a code signs in another device once, as the same person', async () => {
  const a = await newUser('Alice');
  const made = await a.call('POST', '/api/me/security/sign-in-code', {});
  assert.equal(made.status, 200, made.text);
  assert.match(made.body.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  const r = await useCode(made.body.code.toLowerCase().replace('-', ' '));
  assert.equal(r.status, 200, 'typed in lower case with a space is fine');
  const { token } = (await r.json()) as { token: string };
  const me = await fetch(`${BASE}/api/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(((await me.json()) as { id: string }).id, a.id, 'signed in as Alice');
  assert.equal((await useCode(made.body.code)).status, 401, 'a code works once');
  const sessions = (await a.call('GET', '/api/me/security')).body.sessions as { method: string | null }[];
  assert.ok(sessions.some((x) => x.method === 'code'), 'listed as signed in with a code');
  // A new code ends the last one.
  const first = (await a.call('POST', '/api/me/security/sign-in-code', {})).body.code;
  await a.call('POST', '/api/me/security/sign-in-code', {});
  assert.equal((await useCode(first)).status, 401);
  // On the web it's a cookie, not a token.
  const web = await useCode((await a.call('POST', '/api/me/security/sign-in-code', {})).body.code, 'web');
  assert.equal(web.status, 200);
  assert.match(web.headers.get('set-cookie') ?? '', /fb_session=/);
});

test('guessing is cut off', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) statuses.push((await useCode('AAAA-AAAA')).status);
  assert.ok(statuses.includes(429), 'ten wrong codes from one address wait 15 minutes');
  const a = await newUser();
  const good = (await a.call('POST', '/api/me/security/sign-in-code', {})).body.code;
  assert.equal((await useCode(good)).status, 429, 'even a right code waits, so guessing can’t carry on');
});

test('signed out, there is no code to make', async () => {
  assert.equal((await fetch(`${BASE}/api/me/security/sign-in-code`, { method: 'POST' })).status, 401);
});
