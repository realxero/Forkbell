import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askArgsSchema, extractJson, imageLinkIn, labelReadSchema, labelToFood, looksLikeDefaultAmount, per100Problems, preferencesSchema } from './index.ts';

test('100 g with no 100 in the message looks like the per-100 default', () => {
  assert.equal(looksLikeDefaultAmount(100, 'log a bowl of rice'), true);
  assert.equal(looksLikeDefaultAmount(100, 'log 100g of rice'), false);
  assert.equal(looksLikeDefaultAmount(100, 'log 100 g of rice'), false);
  assert.equal(looksLikeDefaultAmount(100, 'about 1000 g of soup'), true);
  assert.equal(looksLikeDefaultAmount(150, 'a bowl of rice'), false);
  assert.equal(looksLikeDefaultAmount(100.0001, 'rice'), true);
});

test('questions need 2 to 4 short choices', () => {
  assert.equal(askArgsSchema.safeParse({ question: 'How big was the bowl?', choices: ['Small', 'Medium', 'Large'] }).success, true);
  assert.equal(askArgsSchema.safeParse({ question: 'How big?', choices: ['One'] }).success, false);
  assert.equal(askArgsSchema.safeParse({ question: 'How big?', choices: ['a', 'b', 'c', 'd', 'e'] }).success, false);
});

test('a per-100 g column is used as printed', () => {
  const r = labelToFood(labelReadSchema.parse({ readable: true, name: 'Oat bar', per100: { kcal: 412, protein: 9.1, carbs: 61, fat: 14 }, serving_g: 40, per_serving: { kcal: 165 } }));
  assert.ok('food' in r);
  assert.equal(r.food.basis, 'per 100 g column');
  assert.deepEqual([r.food.per100.kcal, r.food.per100.protein, r.food.per100.carbs, r.food.per100.fat], [412, 9.1, 61, 14]);
  assert.equal(r.food.servingGrams, 40);
});

test('a US per-serving label is converted to per 100 g', () => {
  // 2/3 cup (55 g): 230 kcal, 3 g protein, 37 g carbs, 8 g fat, 160 mg sodium
  const r = labelToFood(labelReadSchema.parse({ readable: true, serving_label: '2/3 cup (55g)', serving_g: 55, per_serving: { kcal: 230, protein: 3, carbs: 37, fat: 8, sodium_mg: 160 } }));
  assert.ok('food' in r);
  assert.equal(r.food.basis, 'per serving, converted');
  assert.equal(r.food.per100.kcal, 418);
  assert.equal(r.food.per100.protein, 5.5);
  assert.equal(r.food.per100.carbs, 67.3);
  assert.equal(r.food.per100.fat, 14.5);
  assert.equal(r.food.per100.sodium, 291);
  assert.deepEqual(per100Problems(r.food.per100), []);
});

test('kJ-only labels and salt are converted', () => {
  const r = labelToFood(labelReadSchema.parse({ readable: true, per100: { kj: 1674, protein: 10, carbs: 60, fat: 12, salt_g: 1.2 } }));
  assert.ok('food' in r);
  assert.equal(r.food.per100.kcal, 400);
  assert.equal(r.food.per100.sodium, 480);
});

test('per serving without a gram size is refused, not guessed', () => {
  const r = labelToFood(labelReadSchema.parse({ readable: true, per_serving: { kcal: 120, protein: 2, carbs: 20, fat: 3 } }));
  assert.ok('error' in r);
});

test('an unreadable photo says so', () => {
  const r = labelToFood(labelReadSchema.parse({ readable: false }));
  assert.ok('error' in r);
});

test('JSON is pulled out of fenced or chatty answers', () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"readable": true}\n```'), { readable: true });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{broken'), null);
});

test('image links are found in pasted text', () => {
  assert.equal(imageLinkIn('look https://example.com/a/b.JPG?w=600 nice'), 'https://example.com/a/b.JPG?w=600');
  assert.equal(imageLinkIn('https://example.com/menu.png'), 'https://example.com/menu.png');
  assert.equal(imageLinkIn('https://example.com/page.html'), null);
  assert.equal(imageLinkIn('see example.com/a.png'), null);
});

test('old saved preferences get the Bell defaults', () => {
  const p = preferencesSchema.parse({ allergies: ['milk'] });
  assert.deepEqual(p.bell, { askWhenUnsure: true, voiceSends: true, readAloud: 'voice', style: 'buddy' });
});
