// Water: amounts in ml underneath, shown in fl oz to people who use pounds and
// in ml or litres to people who use kilograms.
import type { WeightUnit } from './training.ts';

export const ML_PER_OZ = 29.5735;
export const DEFAULT_WATER_GOAL_ML = 2000;
/** One drink can't be more than this (a typo guard: "500 oz"). */
export const MAX_WATER_ML = 5000;

export interface WaterEntry {
  id: string;
  ml: number;
  /** when it was logged */
  at: string | null;
}

export interface WaterDay {
  date: string;
  entries: WaterEntry[];
  totalMl: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The quick-add buttons: a cup, a standard bottle, a big bottle. */
export function waterButtons(unit: WeightUnit): { ml: number; label: string }[] {
  if (unit === 'lb') return [8, 16.9, 24].map((oz) => ({ ml: Math.round(oz * ML_PER_OZ), label: `+${oz} oz` }));
  return [250, 500, 750].map((ml) => ({ ml, label: `+${ml} ml` }));
}

/** "64 oz", "500 ml", "1.5 L". */
export function waterText(ml: number, unit: WeightUnit): string {
  if (unit === 'lb') {
    const oz = ml / ML_PER_OZ;
    return `${oz < 10 ? round1(oz) : Math.round(oz)} oz`;
  }
  return ml >= 1000 ? `${round1(ml / 1000)} L` : `${Math.round(ml)} ml`;
}

const UNITS: [RegExp, number][] = [
  [/^(fl\.?\s*oz|fluid\s+ounces?|oz|ounces?)$/, ML_PER_OZ],
  [/^(ml|millilit(?:er|re)s?|mls)$/, 1],
  [/^(cl|centilit(?:er|re)s?)$/, 10],
  [/^(l|lit(?:er|re)s?|ltr)$/, 1000],
  [/^(cups?|c)$/, 236.6],
  [/^(glass(?:es)?)$/, 250],
  [/^(bottles?)$/, 500],
];

/**
 * Read an amount someone typed: "20 oz", "1.5 L", "500ml", "2 cups", "16,9 oz".
 * A plain number is in your unit (oz with pounds, ml with kilograms). Returns
 * ml, or null when it isn't an amount of water we can log.
 */
export function parseWater(text: string, unit: WeightUnit): number | null {
  const m = text.trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?|\.\d+)\s*([a-z][a-z.\s]*)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  const word = (m[2] ?? '').trim().replace(/\s+/g, ' ');
  let per: number;
  if (!word) per = unit === 'lb' ? ML_PER_OZ : 1;
  else {
    const hit = UNITS.find(([re]) => re.test(word));
    if (!hit) return null;
    per = hit[1];
  }
  const ml = Math.round(n * per);
  return ml >= 1 && ml <= MAX_WATER_ML ? ml : null;
}

/** A daily goal typed in Settings: like parseWater, but a day's worth (up to 10 L). */
export function parseWaterGoal(text: string, unit: WeightUnit): number | null {
  const m = text.trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*([a-z][a-z.\s]*)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const word = (m[2] ?? '').trim();
  const hit = word ? UNITS.find(([re]) => re.test(word)) : null;
  if (word && !hit) return null;
  // A bare small number with kilograms is litres ("2.5"), not 2.5 ml.
  const per = hit ? hit[1] : unit === 'lb' ? ML_PER_OZ : n <= 10 ? 1000 : 1;
  const ml = Math.round(n * per);
  return ml >= 250 && ml <= 10000 ? ml : null;
}

/** The goal from preferences, never zero. */
export const waterGoalMl = (goal: number | null | undefined) => (goal && goal > 0 ? goal : DEFAULT_WATER_GOAL_ML);

/** The day's total; never below zero. */
export const waterTotal = (entries: Pick<WaterEntry, 'ml'>[]) => Math.max(0, entries.reduce((n, e) => n + e.ml, 0));

/** Did this drink take you over the goal? (for the celebration, once a day) */
export const reachedGoal = (before: number, after: number, goal: number) => before < goal && after >= goal;
