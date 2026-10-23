import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFood, defaultPreferences } from './food-safety.ts';
import { suggestForDay } from './suggestions.ts';
import { planDay, shoppingList } from './planner.ts';
import { bigJump, trainingTips } from './training-tips.ts';
import { sumEntries } from './nutrition.ts';
import { toKg } from './training.ts';
import type { DiaryDay, Food } from './types.ts';

const prefs = (p: Partial<ReturnType<typeof defaultPreferences>> = {}) => ({ ...defaultPreferences(), ...p });
let n = 0;
const food = (name: string, kcal: number, protein: number, carbs: number, fat: number, extra: Partial<Food> = {}): Food => ({
  id: `f${++n}`, name, brand: null, source: 'builtin', sourceId: name.toLowerCase().replace(/\W+/g, '-'), per100: { kcal, protein, carbs, fat, fiber: 0, sugar: 0, sodium: 0 }, servingGrams: null, servingLabel: null, barcode: null, portions: [], ...extra,
});

test('allergies match whole words, not look-alikes', () => {
  const p = prefs({ allergies: ['milk', 'egg', 'tree nuts'] });
  assert.ok(checkFood('Cheddar cheese', p).blocked);
  assert.ok(!checkFood('Peanut butter, smooth', p).blocked, 'peanut butter is not milk or a tree nut');
  assert.ok(!checkFood('Almond milk, unsweetened', prefs({ allergies: ['milk'] })).blocked);
  assert.ok(checkFood('Almond milk, unsweetened', prefs({ allergies: ['tree nuts'] })).blocked);
  assert.ok(!checkFood('Eggplant parmigiana', prefs({ allergies: ['egg'] })).blocked);
  assert.ok(!checkFood('Nutmeg', p).blocked);
});

test('diets and dislikes', () => {
  assert.ok(checkFood('Chicken breast', prefs({ diet: 'vegetarian' })).blocked);
  assert.ok(!checkFood('Salmon', prefs({ diet: 'pescatarian' })).blocked);
  assert.ok(checkFood('Greek yogurt', prefs({ diet: 'vegan' })).blocked);
  assert.ok(!checkFood('Veggie burger', prefs({ diet: 'vegetarian' })).blocked);
  const d = checkFood('Coriander chutney', prefs({ dislikes: ['cilantro'] }));
  assert.ok(d.skip && !d.blocked, 'a dislike keeps it out of suggestions, not out of the diary');
  assert.ok(!checkFood('Hamburger bun', prefs({ dislikes: ['ham'] })).skip, '"ham" is not "hamburger"');
});

const cola = food('Cola, regular', 42, 0, 10.6, 0, { per100: { kcal: 42, protein: 0, carbs: 10.6, fat: 0, fiber: 0, sugar: 10.6, sodium: 4 } });
const zero = food('Cola, zero sugar', 1, 0, 0.1, 0, { sourceId: 'cola-zero' });
const chicken = food('Chicken breast, cooked', 165, 31, 0, 3.6);
const rice = food('White rice, cooked', 130, 2.7, 28, 0.3);
const broccoli = food('Broccoli, cooked', 35, 2.4, 7.2, 0.4, { per100: { kcal: 35, protein: 2.4, carbs: 7.2, fat: 0.4, fiber: 3.3, sugar: 1.4, sodium: 41 } });
const eggs = food('Egg, whole', 143, 12.6, 0.7, 9.5, { portions: [{ label: '1 large', grams: 50 }] });
const oats = food('Oats, rolled, dry', 379, 13.2, 67.7, 6.5, { per100: { kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5, fiber: 10.1, sugar: 1, sodium: 6 } });
const banana = food('Banana', 89, 1.1, 22.8, 0.3, { portions: [{ label: '1 medium', grams: 118 }] });
const salmon = food('Salmon, cooked', 206, 22.1, 0, 12.4);
const potato = food('Potato, baked', 93, 2.5, 21.2, 0.1);
const library = [cola, zero, chicken, rice, broccoli, eggs, oats, banana, salmon, potato, food('Vegetable oil', 884, 0, 0, 100), food('Orange juice', 45, 0.7, 10.4, 0.2)];
const dayWith = (entries: { food: Food; grams: number; meal?: string }[], goals = { kcal: 2200, protein: 150, carbs: null, fat: null }): DiaryDay => {
  const es = entries.map((e, i) => ({ id: `e${i}`, date: '2026-10-23', meal: (e.meal ?? 'lunch') as 'lunch', grams: e.grams, food: e.food }));
  return { date: '2026-10-23', entries: es, totals: sumEntries(es), goals };
};

test('a can of cola gets its zero-sugar twin; protein ideas respect allergies', () => {
  const s = suggestForDay({ day: dayWith([{ food: cola, grams: 368 }]), foods: library, recent: [], prefs: prefs(), hour: 16, isToday: true });
  const swap = s.find((x) => x.kind === 'swap')!;
  assert.equal(swap.items[0]!.food.name, 'Cola, zero sugar');
  assert.match(swap.detail, /Saves about 15\d kcal/);
  const protein = s.find((x) => x.kind === 'protein')!;
  assert.ok(protein.items.some((i) => i.food === chicken));
  const vegan = suggestForDay({ day: dayWith([]), foods: library, recent: [], prefs: prefs({ diet: 'vegan' }), hour: 16, isToday: true });
  assert.ok(!vegan.flatMap((x) => x.items).some((i) => /chicken|salmon|egg/i.test(i.food.name)));
  assert.deepEqual(suggestForDay({ day: dayWith([{ food: cola, grams: 368 }]), foods: library, recent: [], prefs: prefs({ suggestions: { ...defaultPreferences().suggestions, enabled: false } }), hour: 16, isToday: true }), []);
});

test('the planner fills empty meals near the calories left, without allergens or repeats', () => {
  const plan = planDay({ day: dayWith([]), foods: library, recent: [], prefs: prefs({ allergies: ['fish'] }), kcalTarget: 2200, proteinTarget: 150, seed: 3 });
  const names = plan.items.map((i) => i.food.name);
  assert.ok(!names.some((x) => /salmon/i.test(x)), 'no fish');
  assert.equal(new Set(names).size, names.length, 'no repeats');
  assert.ok(plan.items.some((i) => i.meal === 'breakfast') && plan.items.some((i) => i.meal === 'dinner'));
  assert.ok(plan.kcal > 1500 && plan.kcal < 2700, `kcal ${plan.kcal}`);
  assert.ok(!plan.items.some((i) => /oil|juice/i.test(i.food.name)), 'no oil as a vegetable, no juice as fruit');
  const list = shoppingList(plan.items);
  assert.ok(list.length > 0 && list[0]!.aisle === 'Produce');
});

test('training tips: pain follow-up, a check-up nudge, and big jumps', () => {
  const s = (date: string, pain = false, rpe: number | null = null) => ({ date, pain, painNote: pain ? 'left shoulder' : null, sets: [{ weightKg: toKg(135, 'lb'), reps: 8, seconds: null, rpe, warmup: false, done: true }] });
  const tips = trainingTips([s('2026-10-20', true), s('2026-10-13', true)], '2026-10-23');
  assert.deepEqual(tips.map((t) => t.kind), ['pain', 'checkup']);
  assert.ok(trainingTips([s('2026-10-20', false, 9), s('2026-10-17', false, 9.5), s('2026-10-13', false, 10)], '2026-10-23').some((t) => t.kind === 'lighter'));
  const prev = [s('2026-10-20').sets[0]!];
  assert.equal(bigJump(toKg(145, 'lb'), prev, 'lb'), null);
  assert.match(bigJump(toKg(155, 'lb'), prev, 'lb')!, /20 lb more/);
});
