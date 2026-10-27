// Importing a recipe: a web page's schema.org Recipe, Mealie, or pasted lines,
// with Bell (a stand-in AI here) working out each ingredient.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { newUser, startServer, stopServer } from './harness.ts';
import { recipeFromHtml, servingsFrom } from '@forkbell/shared';

const PAGE = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Pancakes","recipeYield":["4","4 servings"],"recipeIngredient":["1 cup flour","2 large eggs","1 cup milk","salt to taste"]}]}</script></head></html>`;
let fake: Server;
const asked: string[] = [];

before(async () => {
  fake = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (req.url === '/pancakes') return void res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
      if (req.url === '/api/recipes/waffles') return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name: 'Waffles', recipeServings: 2, recipeIngredient: [{ display: '1 cup flour' }, { display: '1 large egg' }] }));
      // The stand-in AI: turns each line into a food.
      const sent = JSON.parse(body || '{}') as { messages?: { role: string; content: unknown }[] };
      const lines = String(sent.messages?.find((m) => m.role === 'user')?.content ?? '').split('\n');
      asked.push(lines.join(' | '));
      const known: Record<string, { name: string; grams: number; per100: object }> = {
        '1 cup flour': { name: 'All-purpose flour', grams: 125, per100: { kcal: 364, protein: 10, carbs: 76, fat: 1 } },
        '2 large eggs': { name: 'Egg', grams: 100, per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 } },
        '1 large egg': { name: 'Egg', grams: 50, per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 } },
        '1 cup milk': { name: 'Whole milk', grams: 244, per100: { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 } },
      };
      const items = lines.filter((l) => known[l]).map((l) => ({ line: l, ...known[l]! }));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ items }) } }] }));
    });
  });
  await new Promise<void>((r) => fake.listen(3883, r));
  await startServer({ AI_PROVIDER: 'openai', AI_BASE_URL: 'http://localhost:3883/v1', AI_MODEL: 'm', AI_API_KEY: 'x', AI_ALLOW_CUSTOM_URL: 'true', MEALIE_URL: 'http://127.0.0.1:3883' });
});
after(async () => {
  await stopServer();
  fake.close();
});

test('reading schema.org recipes and servings', () => {
  const r = recipeFromHtml(PAGE);
  assert.deepEqual(r, { name: 'Pancakes', servings: 4, lines: ['1 cup flour', '2 large eggs', '1 cup milk', 'salt to taste'] });
  assert.equal(recipeFromHtml('<html></html>'), null);
  assert.equal(servingsFrom('Serves 6-8'), 6);
  assert.equal(servingsFrom(undefined), 1);
});

test('a link: each ingredient becomes a food, matching ones you already have', async () => {
  const u = await newUser();
  const mine = (await u.call('POST', '/api/foods', { name: 'Whole milk', brand: null, source: 'custom', per100: { kcal: 64, protein: 3.3, carbs: 4.9, fat: 3.5 }, servingGrams: 244, barcode: null })).body.food;
  const r = await u.call('POST', '/api/recipes/import/preview', { source: 'http://localhost:3883/pancakes' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.name, 'Pancakes');
  assert.equal(r.body.servings, 4);
  assert.deepEqual(r.body.ingredients.map((i: { name: string; grams: number }) => [i.name, i.grams]), [['All-purpose flour', 125], ['Egg', 100], ['Whole milk', 244]]);
  const milk = r.body.ingredients.find((i: { name: string }) => i.name === 'Whole milk');
  assert.deepEqual([milk.match.id, milk.match.name], [mine.id, 'Whole milk'], 'your own food is used');
  assert.equal(milk.per100.kcal, 64, 'with its numbers');
  assert.deepEqual(r.body.skipped, ['salt to taste']);
});

test('Mealie, by its link', async () => {
  const u = await newUser();
  const r = await u.call('POST', '/api/recipes/import/preview', { source: 'http://127.0.0.1:3883/g/home/r/waffles' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.body.name, r.body.servings, r.body.source, r.body.ingredients.length], ['Waffles', 2, 'mealie', 2]);
});

test('pasted lines, with a title line', async () => {
  const u = await newUser();
  const r = await u.call('POST', '/api/recipes/import/preview', { source: 'Breakfast\n• 1 cup flour\n- 1 large egg' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.name, 'Breakfast');
  assert.equal(r.body.ingredients.length, 2);
  assert.equal(asked.at(-1), '1 cup flour | 1 large egg', 'bullets dropped');
});
