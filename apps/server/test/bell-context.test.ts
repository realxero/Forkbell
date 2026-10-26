// What Bell is told about your day: water against the goal, and a fast that's going.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { newUser, startServer, stopServer } from './harness.ts';

let ai: Server;
const systems: string[] = [];

before(async () => {
  ai = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const sent = JSON.parse(body || '{}') as { messages?: { role: string; content: unknown }[] };
      systems.push(String(sent.messages?.find((m) => m.role === 'system')?.content ?? ''));
      const last = sent.messages?.at(-1);
      const asked = String(sent.messages?.filter((m) => m.role === 'user').at(-1)?.content ?? '');
      // "I drank a bottle of water": the model proposes it, then answers once the tool has run.
      const message =
        asked.includes('bottle of water') && last?.role !== 'tool'
          ? { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'propose_water', arguments: JSON.stringify({ amount: asked.includes('two') ? '2 bottles' : '16.9 oz' }) } }] }
          : { role: 'assistant', content: last?.role === 'tool' ? 'Nice, tap Add.' : 'Looking good!' };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message }] }));
    });
  });
  await new Promise<void>((r) => ai.listen(3882, r));
  await startServer({ AI_PROVIDER: 'openai', AI_BASE_URL: 'http://localhost:3882/v1', AI_MODEL: 'test-model', AI_API_KEY: 'x' });
});
after(async () => {
  await stopServer();
  ai.close();
});

test('Bell sees today’s water, and a fast only when fasting is on', async () => {
  const u = await newUser();
  const today = '2026-10-25';
  await u.call('POST', '/api/wellbeing/water', { date: today, ml: 500 });
  await u.call('POST', '/api/wellbeing/water', { date: today, ml: 250 });
  await u.call('POST', '/api/wellbeing/fasts', { targetHours: 16, startedAt: new Date(Date.now() - 3 * 3_600_000).toISOString() });
  const ask = () => u.call('POST', '/api/bell/chat', { messages: [{ role: 'user', text: 'How am I doing today?' }], today, meal: 'lunch' });
  const r = await ask();
  assert.equal(r.status, 200, r.text);
  assert.match(systems.at(-1)!, /Water today: 25 oz of a 68 oz goal, 42 oz to go/);
  assert.doesNotMatch(systems.at(-1)!, /Fasting now/, 'the fasting timer is off, so Bell is not told');
  const me = (await u.call('GET', '/api/me')).body;
  await u.call('PUT', '/api/me/preferences', { ...me.preferences, fasting: { show: true, hours: 16 } });
  await ask();
  assert.match(systems.at(-1)!, /Fasting now: 3h 0\dm into a 16-hour fast/);
});

test('Bell proposes water; nothing is logged until the person taps Add', async () => {
  const u = await newUser();
  const today = '2026-10-25';
  const r = await u.call('POST', '/api/bell/chat', { messages: [{ role: 'user', text: 'I drank a bottle of water' }], today, meal: 'lunch' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.body.water, { ml: 500, date: today });
  assert.equal(r.body.reply, 'Nice, tap Add.');
  assert.equal((await u.call('GET', `/api/wellbeing/water/${today}`)).body.totalMl, 0, 'not logged by Bell');
  const two = await u.call('POST', '/api/bell/chat', { messages: [{ role: 'user', text: 'I had two bottle of water' }], today, meal: 'lunch' });
  assert.equal(two.body.water.ml, 1000, '"2 bottles" is 1 L');
});
