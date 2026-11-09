// Body calculators: body fat from a tape measure (US Navy method), BMI, and
// fat-free mass index, plus a cut or bulk timeline at a steady weekly pace.
// Estimates from simple measurements, said as such wherever they're shown.
import { addDays } from './dates.ts';

export type Sex = 'male' | 'female';

/** US Navy body-fat %, from centimetres. Hips count for women only. Null when the tape numbers can't be right. */
export function navyBodyFat(o: { sex: Sex; heightCm: number; neckCm: number; waistCm: number; hipCm?: number | null }): number | null {
  const { sex, heightCm: h, neckCm: neck, waistCm: waist } = o;
  if (sex === 'male') {
    if (!(waist > neck && h > 0)) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
    return bf > 2 && bf < 70 ? bf : null;
  }
  const hip = o.hipCm ?? 0;
  if (!(waist + hip > neck && hip > 0 && h > 0)) return null;
  const bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(h)) - 450;
  return bf > 8 && bf < 70 ? bf : null;
}

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2;

/** Fat-free mass index, adjusted to a 1.8 m height so tall and short people compare. */
export function ffmi(weightKg: number, heightCm: number, bodyFatPct: number) {
  const m = heightCm / 100;
  const lean = weightKg * (1 - bodyFatPct / 100);
  return lean / m ** 2 + 6.1 * (1.8 - m);
}

/**
 * A cut or bulk at a steady % of body weight a week: when you'd reach the
 * target, and where you'd be each week on the way (each week's change is
 * that % of the weight you're at then).
 */
export function phaseTimeline(o: { startKg: number; targetKg: number; pctPerWeek: number; start: string }): { weeks: number; end: string; checkpoints: { date: string; kg: number }[] } | null {
  const dir = Math.sign(o.targetKg - o.startKg);
  if (!dir || o.pctPerWeek <= 0) return null;
  const checkpoints: { date: string; kg: number }[] = [];
  let kg = o.startKg;
  for (let w = 1; w <= 156; w++) {
    kg += dir * kg * (o.pctPerWeek / 100);
    const done = dir > 0 ? kg >= o.targetKg : kg <= o.targetKg;
    checkpoints.push({ date: addDays(o.start, w * 7), kg: done ? o.targetKg : kg });
    if (done) return { weeks: w, end: addDays(o.start, w * 7), checkpoints };
  }
  return null; // more than three years: not a plan worth drawing
}
