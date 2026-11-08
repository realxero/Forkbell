// Bodies are capped before they're read: a huge sign-in request is refused
// without the server holding it all in memory.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { caller, newUser, startServer, stopServer } from './harness.ts';

const anon = caller(null);
before(() => startServer());
after(stopServer);

test('sign-in takes a small body, and refuses a huge one', async () => {
  const big = await anon('POST', '/auth/password/login', { username: 'someone', password: 'x'.repeat(200_000) });
  assert.equal(big.status, 413);
  assert.match(big.body.error, /more than the server takes/);
});

test('the API takes a photo-sized body, and refuses one far bigger', async () => {
  const u = await newUser();
  const ok = await u.call('POST', '/api/shares/accept', { code: 'x'.repeat(5_000_000) });
  assert.equal(ok.status, 400, 'a 5 MB body reaches the route (which refuses the code itself)');
  const big = await u.call('POST', '/api/shares/accept', { code: 'x'.repeat(20_000_000) });
  assert.equal(big.status, 413);
});
