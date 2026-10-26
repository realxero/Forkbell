// A server with no Authelia at all: passwords only.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { caller, startServer, stopServer } from './harness.ts';

const anon = caller(null);
before(() => startServer({ OIDC_ISSUER: '', PASSWORD_LOGIN: '', PASSWORD_SIGNUP: 'off' }));
after(stopServer);

test('with no OIDC_ISSUER, passwords are on and single sign-on is off', async () => {
  const m = await anon('GET', '/auth/methods');
  assert.equal(m.body.sso, null);
  assert.ok(m.body.password, 'passwords turn on by themselves when there is no single sign-on');
  // This database already has people, so sign-up stays closed.
  assert.equal(m.body.password.signup, 'off');
  const login = await anon('GET', '/auth/login');
  assert.equal(login.status, 404);
  assert.match(login.type, /json/);
  assert.equal((await anon('POST', '/auth/password/signup', { username: 'newperson', password: 'a long enough password' })).status, 403);
});
