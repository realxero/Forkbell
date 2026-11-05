// Recipe links on the server's own network are refused unless
// IMPORT_PRIVATE_LINKS=true, even when AI_ALLOW_CUSTOM_URL is on (that switch
// is about Bell using your own AI server, not about the server fetching
// addresses on your network for anyone signed in).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { newUser, startServer, stopServer } from './harness.ts';

const PAGE = `<html><head><script type="application/ld+json">{"@type":"Recipe","name":"Secret","recipeIngredient":["1 cup flour"]}</script></head></html>`;
let fake: Server;
let hits = 0;

before(async () => {
  fake = createServer((req, res) => {
    hits++;
    res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  });
  await new Promise<void>((r) => fake.listen(3884, r));
  // An AI is set up (import needs one), and custom AI addresses are allowed.
  await startServer({ AI_PROVIDER: 'openai', AI_BASE_URL: 'http://localhost:3884/v1', AI_MODEL: 'm', AI_API_KEY: 'x', AI_ALLOW_CUSTOM_URL: 'true' });
});
after(async () => {
  await stopServer();
  fake.close();
});

const PRIVATE = /private network/;

test('a link to a name on this network is refused, and never fetched', async () => {
  const u = await newUser();
  hits = 0;
  const r = await u.call('POST', '/api/recipes/import/preview', { source: 'http://localhost:3884/page' });
  assert.equal(r.status, 502, `answered ${r.status}`);
  assert.match(r.body.error, PRIVATE);
  assert.equal(hits, 0, 'the page was fetched');
});

test('a link that is a private address itself is refused too', async () => {
  const u = await newUser();
  hits = 0;
  for (const source of ['http://127.0.0.1:3884/page', 'http://[::1]:3884/page', 'http://192.168.1.1/']) {
    const r = await u.call('POST', '/api/recipes/import/preview', { source });
    assert.equal(r.status, 502, `${source} answered ${r.status}`);
    assert.match(r.body.error, PRIVATE, source);
  }
  assert.equal(hits, 0);
});
