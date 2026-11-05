// Behind Cloudflare Tunnel every request reaches Traefik from the tunnel's own
// container, so the last X-Forwarded-For hop is the same for everyone. With
// TRUSTED_IP_HEADER=cf-connecting-ip, the wrong-password limit "per address"
// counts each visitor's real address, so one person's guesses can't lock out
// everyone else.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { BASE, startServer, stopServer } from './harness.ts';

before(() => startServer({ PASSWORD_LOGIN: 'on', TRUSTED_IP_HEADER: 'cf-connecting-ip' }));
after(stopServer);

const TUNNEL = '172.18.0.5';
const login = (visitor: string) =>
  fetch(`${BASE}/auth/password/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${visitor}, ${TUNNEL}`, 'cf-connecting-ip': visitor },
    body: JSON.stringify({ username: `nobody${randomBytes(4).toString('hex')}`, password: 'wrong wrong wrong', platform: 'native' }),
  }).then((r) => r.status);

test('one visitor’s wrong passwords lock out that visitor, not everyone behind the tunnel', async () => {
  // 30 wrong guesses (each for a different username, so only the address limit applies).
  for (let i = 0; i < 30; i++) assert.equal(await login('203.0.113.1'), 401, `guess ${i + 1}`);
  assert.equal(await login('203.0.113.1'), 429, 'the guesser is made to wait');
  assert.equal(await login('198.51.100.7'), 401, 'someone else arriving through the same tunnel is not');
});
