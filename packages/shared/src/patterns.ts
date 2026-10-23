// Patterns in your own logging, from the NutriTrace fork: foods that go with
// eating more (or less), heavy weekdays, and breakfast protein. Only shown
// when there are enough days on both sides, the difference is large, and it
// passes a simple significance test; always with how many days it rests on.
// A pattern, not proof.

export interface PatternDay {
  date: string;
  kcal: number;
  breakfastKcal: number;
  breakfastProtein: number;
  foods: { id: string; name: string }[];
}

export interface Insight {
  key: string;
  text: string;
  days: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1);
};
/** Welch's t: how many "standard errors" apart two groups' means are. */
export function welchT(a: number[], b: number[]) {
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  return se === 0 ? (mean(a) === mean(b) ? 0 : Infinity) : (mean(a) - mean(b)) / se;
}
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const r50 = (n: number) => Math.round(n / 50) * 50;

export function findPatterns(days: PatternDay[], opts: { minEach?: number; minKcal?: number } = {}): Insight[] {
  const minEach = opts.minEach ?? 5;
  const minKcal = opts.minKcal ?? 200;
  const out: (Insight & { strength: number })[] = [];
  const logged = days.filter((d) => d.kcal > 300); // skip barely-logged days

  // Foods that go with eating more or less that day.
  const foods = new Map<string, string>();
  for (const d of logged) for (const f of d.foods) foods.set(f.id, f.name);
  for (const [id, name] of foods) {
    const withIt = logged.filter((d) => d.foods.some((f) => f.id === id)).map((d) => d.kcal);
    const without = logged.filter((d) => !d.foods.some((f) => f.id === id)).map((d) => d.kcal);
    if (withIt.length < minEach || without.length < minEach) continue;
    const diff = mean(withIt) - mean(without);
    const t = welchT(withIt, without);
    if (Math.abs(diff) < minKcal || Math.abs(t) < 2) continue;
    out.push({
      key: `food:${id}`,
      text: `On days you have ${name}, you eat about ${r50(Math.abs(diff)).toLocaleString()} kcal ${diff > 0 ? 'more' : 'less'} overall.`,
      days: withIt.length + without.length,
      strength: Math.abs(t),
    });
  }

  // Weekdays that run heavy or light.
  for (let wd = 0; wd < 7; wd++) {
    const on = logged.filter((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() === wd).map((d) => d.kcal);
    const off = logged.filter((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay() !== wd).map((d) => d.kcal);
    if (on.length < 4 || off.length < minEach) continue;
    const diff = mean(on) - mean(off);
    const t = welchT(on, off);
    if (Math.abs(diff) < Math.max(minKcal, 250) || Math.abs(t) < 2) continue;
    out.push({ key: `weekday:${wd}`, text: `${WEEKDAYS[wd]} tend to run about ${r50(Math.abs(diff)).toLocaleString()} kcal ${diff > 0 ? 'heavier' : 'lighter'} for you.`, days: on.length + off.length, strength: Math.abs(t) });
  }

  // A protein-rich breakfast and the rest of the day.
  const withBreakfast = logged.filter((d) => d.breakfastKcal > 0);
  const high = withBreakfast.filter((d) => d.breakfastProtein >= 25).map((d) => d.kcal - d.breakfastKcal);
  const low = withBreakfast.filter((d) => d.breakfastProtein < 25).map((d) => d.kcal - d.breakfastKcal);
  if (high.length >= minEach && low.length >= minEach) {
    const diff = mean(high) - mean(low);
    const t = welchT(high, low);
    if (Math.abs(diff) >= 150 && Math.abs(t) >= 2) {
      out.push({
        key: 'breakfast-protein',
        text: `After a breakfast with 25 g of protein or more, you eat about ${r50(Math.abs(diff)).toLocaleString()} kcal ${diff < 0 ? 'less' : 'more'} for the rest of the day.`,
        days: high.length + low.length,
        strength: Math.abs(t),
      });
    }
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, 6).map(({ strength: _s, ...i }) => i);
}
