import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFoodExport, readDate, readMeal } from './food-import.ts';

test('MyFitnessPal: one line per meal, with its totals', () => {
  const r = parseFoodExport('Date,Meal,Calories,Fat (g),Saturated Fat,Sodium (mg),Carbohydrates (g),Fiber,Sugar,Protein (g),Note\n2025-03-15,Breakfast,420,12,3,300,55,6,10,25,\n2025-03-15,Snacks,180,8,1,90,20,2,12,4,');
  assert.equal(r.format, 'myfitnesspal');
  assert.deepEqual(r.lines[0], { date: '2025-03-15', meal: 'breakfast', name: 'Breakfast (MyFitnessPal)', kcal: 420, protein: 25, carbs: 55, fat: 12, fiber: 6, sugar: 10, sodium: 300 });
});

test('Cronometer: each food, with its amount in the name', () => {
  const r = parseFoodExport('Day,Time,Group,Food Name,Amount,Energy (kcal),Protein (g),Carbs (g),Fat (g),Fiber (g)\n2025-03-15,08:10,Breakfast,"Oats, Rolled",80.00 g,303,10.5,54,5.3,8');
  assert.equal(r.format, 'cronometer');
  assert.equal(r.lines[0]!.name, 'Oats, Rolled (80.00 g)');
  assert.equal(r.lines[0]!.kcal, 303);
});

test('Lose It: US dates, quantity and units', () => {
  const r = parseFoodExport('Date,Name,Type,Quantity,Units,Calories,Fat (g),Protein (g),Carbohydrates (g)\n03/15/2025,Banana,Snacks,1,Each,105,0.4,1.3,27');
  assert.equal(r.format, 'loseit');
  assert.deepEqual([r.lines[0]!.date, r.lines[0]!.name, r.lines[0]!.meal], ['2025-03-15', 'Banana (1 Each)', 'snacks']);
});

test('not a food diary', () => {
  assert.equal(parseFoodExport('title,start_time\nx,y').format, null);
});

test('dates and meals', () => {
  assert.equal(readDate('15.03.2025'), '2025-03-15');
  assert.equal(readDate('2025-3-5 08:30'), '2025-03-05');
  assert.equal(readMeal('Frühstück'), 'breakfast');
  assert.equal(readMeal('Snack 2'), 'snacks');
});
