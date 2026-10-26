// What Bell is told about your day: water against the goal, and a fast that's going.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { newUser, startServer, stopServer } from './harness.ts';

let ai: Server;
const systems: string[] = [];
const searches: string[] = [];
const toolNames: string[][] = [];
let hang = false;
let script: ((sent: { messages?: { role: string; content: unknown }[] }) => unknown) | null = null;

before(async () => {
  ai = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.url?.startsWith('/search')) {
        searches.push(new URL(req.url, 'http://x').searchParams.get('q') ?? '');
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results: [{ title: "Croissant Grilled Cheese | Peet's", url: 'https://www.peets.com/x', content: '470 calories' }] }));
        return;
      }
      const sent = JSON.parse(body || '{}') as { messages?: { role: string; content: unknown }[]; tools?: { function?: { name: string } }[] };
      toolNames.push((sent.tools ?? []).map((t) => t.function?.name ?? ''));
      systems.push(String(sent.messages?.find((m) => m.role === 'system')?.content ?? ''));
      if (hang) return; // the AI service never answers
      if (script) {
        const m = script(sent);
        if (m) {
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: m }] }));
          return;
        }
      }
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
  await startServer({ AI_PROVIDER: 'openai', AI_BASE_URL: 'http://localhost:3882/v1', AI_MODEL: 'test-model', AI_API_KEY: 'x', SEARCH_URL: 'http://localhost:3882', BELL_ANSWER_WITHIN_MS: '3000' });
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

test('Bell can search the web when SEARCH_URL is set, and a correction replaces the old entry', async () => {
  const u = await newUser();
  const today = '2026-10-25';
  const food = (await u.call('POST', '/api/foods', { name: 'Croissant grilled cheese', brand: null, source: 'custom', per100: { kcal: 400, protein: 12, carbs: 30, fat: 25 }, servingGrams: null, barcode: null })).body.food;
  const entry = (await u.call('POST', '/api/diary', { date: today, meal: 'lunch', grams: 140, foodId: food.id })).body;
  const entryId = entry.entry?.id ?? entry.id;
  assert.ok(entryId, JSON.stringify(entry));
  let round = 0;
  script = (sent) => {
    const last = sent.messages?.at(-1);
    if (last?.role === 'tool') return round++ === 0 ? null : { role: 'assistant', content: 'Here’s the fix. Tap Add and the old one goes.' };
    return {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 's1', type: 'function', function: { name: 'search_web', arguments: JSON.stringify({ query: "Peet's croissant grilled cheese calories" }) } },
        { id: 'p1', type: 'function', function: { name: 'propose_food_entries', arguments: JSON.stringify({ items: [{ name: 'Croissant Grilled Cheese', brand: "Peet's Coffee", grams: 140, per100: { kcal: 335, protein: 13, carbs: 30, fat: 20 }, estimate: false, expected_kcal: 470, replaces_entry_id: entryId }] }) } },
      ],
    };
  };
  const r = await u.call('POST', '/api/bell/chat', { messages: [{ role: 'user', text: "Peet's says it's 470" }], today, meal: 'lunch' });
  script = null;
  assert.equal(r.status, 200, r.text);
  assert.ok(toolNames.at(-1)!.includes('search_web'), 'offered when SEARCH_URL is set');
  assert.equal(searches.at(-1), "Peet's croissant grilled cheese calories");
  const p = r.body.proposals[0];
  assert.equal(Math.round((p.per100.kcal * p.grams) / 100), 470, 'the stated 470, not 469');
  assert.deepEqual(p.replaces, { id: entryId, name: 'Croissant grilled cheese', kcal: 560 });
  assert.match(systems.at(-1)!, /Never say you'll do something/);
});

test('Bell answers in time even when the AI service is slow', async () => {
  const u = await newUser();
  hang = true;
  const started = Date.now();
  const r = await u.call('POST', '/api/bell/chat', { messages: [{ role: 'user', text: 'hello' }], today: '2026-10-25', meal: 'lunch' });
  hang = false;
  assert.equal(r.status, 200, r.text);
  assert.match(r.body.reply, /ran out of time/);
  assert.ok(Date.now() - started < 10_000, 'within the limit (3 s in this test; 75 s for real)');
});
