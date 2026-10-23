import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPatterns, type PatternDay } from './patterns.ts';
import { addDays } from './dates.ts';

// 8 weeks; pizza days and Saturdays run heavy, protein breakfasts lead to less later.
const days: PatternDay[] = Array.from({ length: 56 }, (_, i) => {
  const date = addDays('2026-08-01', i); // a Saturday
  const sat = i % 7 === 0;
  const pizza = i % 5 === 0;
  const eggs = i % 2 === 0;
  const breakfastKcal = 400;
  const rest = 1500 + (eggs ? -250 : 0) + (pizza ? 700 : 0) + (sat ? 600 : 0) + ((i * 37) % 120);
  return { date, kcal: breakfastKcal + rest, breakfastKcal, breakfastProtein: eggs ? 30 : 10, foods: [...(pizza ? [{ id: 'p', name: 'pizza' }] : []), ...(eggs ? [{ id: 'e', name: 'eggs' }] : [])] };
});

test('finds strong patterns and says how many days they rest on', () => {
  const out = findPatterns(days);
  const text = out.map((x) => x.text).join(' | ');
  assert.match(text, /On days you have pizza, you eat about \d+ kcal more/);
  assert.match(text, /Saturdays tend to run about [\d,]+ kcal heavier/);
  assert.match(text, /After a breakfast with 25 g of protein or more, you eat about \d+ kcal less/);
  assert.ok(out.every((x) => x.days >= 10));
});

test('stays quiet without enough days or a real difference', () => {
  assert.deepEqual(findPatterns(days.slice(0, 6)), []);
  const flat = days.map((d) => ({ ...d, kcal: 2000 + ((d.date.charCodeAt(9) * 13) % 40), breakfastKcal: 400 }));
  assert.deepEqual(findPatterns(flat), []);
});
