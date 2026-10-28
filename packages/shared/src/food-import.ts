// Food history from another app: MyFitnessPal, Lose It, Cronometer and Yazio
// exports (CSV), worked out from their column names, read on the phone. Each
// line becomes one diary entry with that line's numbers. MyFitnessPal only
// exports each meal's totals, so those come in as one line per meal.
import { z } from 'zod';
import { parseCsv } from './workout-import.ts';
import type { Meal } from './types.ts';

export type FoodImportFormat = 'myfitnesspal' | 'loseit' | 'cronometer' | 'yazio' | 'generic';
export const FOOD_IMPORT_APPS: Record<FoodImportFormat, string> = { myfitnesspal: 'MyFitnessPal', loseit: 'Lose It', cronometer: 'Cronometer', yazio: 'Yazio', generic: 'a spreadsheet' };

export const importedFoodLineSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snacks', 'meal5', 'meal6']),
  name: z.string().trim().min(1).max(200),
  kcal: z.number().min(0).max(20000),
  protein: z.number().min(0).max(2000),
  carbs: z.number().min(0).max(3000),
  fat: z.number().min(0).max(2000),
  fiber: z.number().min(0).max(500).nullable(),
  sugar: z.number().min(0).max(2000).nullable(),
  sodium: z.number().min(0).max(100000).nullable(),
});
export type ImportedFoodLine = z.infer<typeof importedFoodLineSchema>;
export const foodImportSchema = z.object({
  format: z.enum(['myfitnesspal', 'loseit', 'cronometer', 'yazio', 'generic']),
  lines: z.array(importedFoodLineSchema).min(1).max(20000),
  /** count imported days as finished, so your daily-burn estimate can use them */
  markComplete: z.boolean().default(true),
  dryRun: z.boolean().default(true),
});
export interface FoodImportResult {
  days: number;
  lines: number;
  /** days that already have food in Forkbell, left as they are */
  skippedDays: number;
  from: string | null;
  to: string | null;
  dryRun: boolean;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');
const num = (v: string | undefined) => {
  const t = (v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(t);
  return t && Number.isFinite(n) ? n : null;
};
/** "2026-03-15", "03/15/2026", "15.03.2026", "2026-03-15 08:30" → "2026-03-15". */
export function readDate(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t); // US: month first
  if (m) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t); // Europe: day first
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return null;
}
/** "Breakfast", "Snack", "Dinner", "Frühstück"... → a meal key; anything else is a snack. */
export function readMeal(v: string | undefined): Meal {
  const t = (v ?? '').toLowerCase();
  if (/breakfast|frühstück|morning|desayuno/.test(t)) return 'breakfast';
  if (/lunch|mittag|almuerzo/.test(t)) return 'lunch';
  if (/dinner|supper|abend|cena/.test(t)) return 'dinner';
  return 'snacks';
}

/** Which column holds what: the first header that matches each. */
function columns(headers: string[]) {
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = headers.findIndex((h) => re.test(h));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    date: find(/^date$/, /^day$/, /^date\b/),
    meal: find(/^meal$/, /^group$/, /^type$/, /meal/),
    name: find(/^food name$/, /^name$/, /^food$/, /^item$/, /description/),
    amount: find(/^amount$/, /^quantity$/, /^serving/),
    units: find(/^units?$/),
    kcal: find(/^energy \(kcal\)$/, /^calories( \(kcal\))?$/, /^kcal$/, /calorie/, /energy/),
    protein: find(/^protein/),
    carbs: find(/^carbohydrates?\b/, /^carbs\b/, /^net carbs/),
    fat: find(/^fat\b/, /^total fat/),
    fiber: find(/^fiber/, /^fibre/),
    sugar: find(/^sugars?\b/),
    sodium: find(/^sodium/),
  };
}

export function detectFoodFormat(headers: string[]): FoodImportFormat | null {
  const h = headers.map(norm);
  const has = (re: RegExp) => h.some((x) => re.test(x));
  if (has(/^food name$/) && has(/^energy \(kcal\)$/)) return 'cronometer';
  if (has(/^meal$/) && has(/^calories$/) && has(/^fat \(g\)$/) && !has(/^(food )?name$/)) return 'myfitnesspal';
  if (has(/^name$/) && has(/^quantity$/) && has(/^units$/) && has(/^calories$/)) return 'loseit';
  if (has(/yazio/) || (has(/^product$/) && has(/^energy/))) return 'yazio';
  const c = columns(h);
  return c.date >= 0 && c.kcal >= 0 && (c.name >= 0 || c.meal >= 0) ? 'generic' : null;
}

/** Read an export. Lines without a date or calories are left out and counted. */
export function parseFoodExport(text: string): { format: FoodImportFormat | null; lines: ImportedFoodLine[]; problems: string[] } {
  const rows = parseCsv(text);
  const headers = (rows[0] ?? []).map(norm);
  const format = detectFoodFormat(headers);
  if (!format) return { format: null, lines: [], problems: ['This doesn’t look like a food diary export from MyFitnessPal, Lose It, Cronometer or Yazio (the columns don’t match). Export a CSV file of your food log and pick that.'] };
  const c = columns(headers);
  // Yazio's product column.
  if (format === 'yazio' && c.name < 0) c.name = headers.findIndex((x) => x === 'product');
  const lines: ImportedFoodLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const date = readDate(r[c.date]);
    const kcal = num(r[c.kcal]);
    if (!date || kcal === null) {
      if (r.some((x) => x.trim())) skipped++;
      continue;
    }
    const meal = readMeal(c.meal >= 0 ? r[c.meal] : '');
    const baseName = (c.name >= 0 ? r[c.name] : '')?.trim() || `${meal[0]!.toUpperCase()}${meal.slice(1)} (${FOOD_IMPORT_APPS[format]})`;
    const amount = c.amount >= 0 ? r[c.amount]?.trim() : '';
    const units = c.units >= 0 ? r[c.units]?.trim() : '';
    const name = `${baseName}${amount ? ` (${amount}${units ? ` ${units}` : ''})` : ''}`.slice(0, 200);
    const g = (i: number) => Math.max(0, num(r[i]) ?? 0);
    lines.push({
      date,
      meal,
      name,
      kcal: Math.max(0, kcal),
      protein: c.protein >= 0 ? g(c.protein) : 0,
      carbs: c.carbs >= 0 ? g(c.carbs) : 0,
      fat: c.fat >= 0 ? g(c.fat) : 0,
      fiber: c.fiber >= 0 ? num(r[c.fiber]) : null,
      sugar: c.sugar >= 0 ? num(r[c.sugar]) : null,
      sodium: c.sodium >= 0 ? num(r[c.sodium]) : null,
    });
  }
  const problems = skipped ? [`${skipped} line${skipped === 1 ? '' : 's'} without a date or calories ${skipped === 1 ? 'was' : 'were'} left out.`] : [];
  if (!lines.length) problems.push('No food lines were found in the file.');
  return { format, lines, problems };
}
