// Bell's tools. Reads go through the same API routes the app uses (as the
// signed-in person, so row-level security applies); Bell never writes. Food
// it wants to log comes back as proposals the person reviews and confirms.
import { per100Problems, proposeArgsSchema, type DiaryDay, type Food, type FoodProposal, type Meal } from '@forkbell/shared';
import type { ToolSpec } from './providers.ts';

export type Internal = (path: string) => Promise<unknown>;

export const TOOLS: ToolSpec[] = [
  {
    name: 'get_day',
    description: "The person's food diary for one day: each entry with grams and calories, the day's totals and their goals.",
    parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] },
  },
  {
    name: 'get_progress',
    description: 'Weight trend, estimated daily burn, goal weight and date estimate, streaks, milestones and activity (steps).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_recent_foods',
    description: 'Foods the person logged recently and most often, with their usual amounts. Check this first when they name a food they eat often.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_foods',
    description: "Search the person's foods, the built-in common foods and Open Food Facts. Use before proposing a food, so real nutrition data is used when it exists.",
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_workouts',
    description: 'Recent workouts: date, name, sets and volume.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_exercise',
    description: 'One exercise by name: personal records and recent sessions with weights and reps.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'propose_food_entries',
    description:
      'Suggest foods to log. The person sees a review card and confirms; nothing is logged until then. Use food_id when a food from search_foods or get_recent_foods matches (from "mine" results, which have an id). Otherwise give per100 values: from a label or database if known (estimate=false), or your best estimate (estimate=true). grams is the amount eaten, never 100 by default: work it out from what they said or saw.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              brand: { type: 'string' },
              grams: { type: 'number', description: 'amount eaten in grams (or ml for drinks)' },
              meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snacks'] },
              date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
              food_id: { type: 'string' },
              per100: {
                type: 'object',
                properties: { kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' } },
                required: ['kcal', 'protein', 'carbs', 'fat'],
              },
              estimate: { type: 'boolean' },
              note: { type: 'string', description: 'short note shown on the card, e.g. "assumed one medium bowl"' },
            },
            required: ['name', 'grams'],
          },
        },
      },
      required: ['items'],
    },
  },
];

const trimFood = (f: Food & { id?: string }) => ({
  ...(f.id ? { id: f.id } : {}),
  name: f.name,
  brand: f.brand,
  per100: { kcal: f.per100.kcal, protein: f.per100.protein, carbs: f.per100.carbs, fat: f.per100.fat },
  serving_g: f.servingGrams,
  portions: f.portions?.slice(0, 3),
});

/** Run one tool. Returns text for the model; proposals are collected separately. */
export async function runTool(name: string, args: unknown, ctx: { call: Internal; today: string; meal: Meal; proposals: FoodProposal[] }): Promise<string> {
  const a = (args ?? {}) as Record<string, string>;
  switch (name) {
    case 'get_day': {
      const day = (await ctx.call(`/api/diary/${encodeURIComponent(a.date ?? ctx.today)}`)) as DiaryDay;
      return JSON.stringify({
        date: day.date,
        goals: day.goals,
        totals: day.totals,
        entries: day.entries.map((e) => ({ meal: e.meal, name: e.food.name, brand: e.food.brand, grams: e.grams, kcal: Math.round((e.food.per100.kcal * e.grams) / 100) })),
      });
    }
    case 'get_progress': {
      const p = (await ctx.call(`/api/progress?today=${ctx.today}`)) as Record<string, unknown> & { weighIns: { date: string; weightKg: number; trendKg: number }[] };
      return JSON.stringify({ ...p, weighIns: p.weighIns.slice(-14).map((w) => ({ date: w.date, kg: w.weightKg, trend_kg: Math.round(w.trendKg * 10) / 10 })), milestones: undefined });
    }
    case 'get_recent_foods': {
      const r = (await ctx.call(`/api/foods/recent?today=${ctx.today}`)) as { recent: { food: Food; lastGrams: number; uses: number }[]; frequent: { food: Food; lastGrams: number; uses: number }[] };
      const seen = new Set<string>();
      return JSON.stringify(
        [...r.frequent, ...r.recent].filter((x) => !seen.has(x.food.id) && seen.add(x.food.id)).slice(0, 25).map((x) => ({ ...trimFood(x.food), usual_g: x.lastGrams, times: x.uses })),
      );
    }
    case 'search_foods': {
      const r = (await ctx.call(`/api/foods/search?q=${encodeURIComponent(a.query ?? '')}`)) as { mine: Food[]; results: Food[] };
      return JSON.stringify({ mine: r.mine.slice(0, 8).map(trimFood), databases: r.results.slice(0, 6).map(trimFood) });
    }
    case 'get_workouts':
      return JSON.stringify(await ctx.call('/api/workouts?limit=10'));
    case 'get_exercise': {
      const list = (await ctx.call('/api/exercises')) as { exercises: { id: string; name: string }[] };
      const q = (a.name ?? '').toLowerCase();
      const hit = list.exercises.find((e) => e.name.toLowerCase() === q) ?? list.exercises.find((e) => e.name.toLowerCase().includes(q));
      if (!hit) return JSON.stringify({ error: `No exercise called "${a.name}".` });
      const d = (await ctx.call(`/api/exercises/${hit.id}`)) as Record<string, unknown> & { sessions: unknown[] };
      return JSON.stringify({ ...d, sessions: d.sessions.slice(0, 6), trend: undefined });
    }
    case 'propose_food_entries': {
      const parsed = proposeArgsSchema.safeParse(args);
      if (!parsed.success) return `Not proposed: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}. Fix and try again.`;
      const lib = (await ctx.call('/api/foods/library')) as { foods: Food[] };
      const problems: string[] = [];
      for (const item of parsed.data.items) {
        const food = item.food_id ? lib.foods.find((f) => f.id === item.food_id) ?? null : null;
        if (item.food_id && !food) {
          problems.push(`${item.name}: food_id not found; give per100 instead.`);
          continue;
        }
        if (!food) {
          if (!item.per100) {
            problems.push(`${item.name}: needs food_id or per100.`);
            continue;
          }
          // The same impossible-number checks as foods people type in.
          const bad = per100Problems(item.per100);
          if (bad.length) {
            problems.push(`${item.name}: ${bad[0]} Check you used per-100 g values, not per serving.`);
            continue;
          }
        }
        ctx.proposals.push({
          name: food?.name ?? item.name,
          brand: food?.brand ?? item.brand ?? null,
          grams: Math.round(item.grams * 10) / 10,
          meal: item.meal ?? ctx.meal,
          date: item.date ?? ctx.today,
          food,
          per100: food ? null : item.per100!,
          estimate: food ? false : item.estimate !== false,
          note: item.note ?? null,
        });
      }
      const ok = parsed.data.items.length - problems.length;
      return problems.length
        ? `${ok} item(s) shown to the person for review. Not shown: ${problems.join(' ')}`
        : `${ok} item(s) shown to the person for review. They will confirm or change them; do not say they are logged.`;
    }
    default:
      return `Unknown tool ${name}.`;
  }
}

export function systemPrompt(opts: { today: string; localTime?: string; unit: 'lb' | 'kg'; name: string | null }) {
  return `You are Bell, the assistant inside Forkbell, a food and training tracker. You're talking with ${opts.name ?? 'the person who owns this account'}.
Today is ${opts.today}${opts.localTime ? `, ${opts.localTime} on their phone` : ''}. They use ${opts.unit} for body and lifting weights. Foods are always stored per 100 g.

How to help:
- Answer questions about their own data with the tools. Never guess numbers about them; look them up.
- To log food, use propose_food_entries. Search or check recent foods first and prefer a real match. The person reviews every item, so say "here's what I'd log" and never claim it's logged.
- For a photo of a meal: name each food you see and estimate grams from what's on the plate; mark estimates. For a nutrition label, read the per-100 g column (or convert from per-serving using the serving size) and set estimate=false.
- If an unseen detail would change calories a lot (oil, sauce, portion), make a sensible assumption, say it in the note, and invite a correction.
- Keep replies short and plain. Use their units.

Safety:
- You are not a doctor or dietitian. For medical conditions, pregnancy, eating disorders, injuries or medication, suggest a professional.
- Never recommend eating under 1,200 kcal a day or losing more than about 1% of body weight a week.
- Never encourage training through pain; suggest rest, an easier variation, or getting it checked.
- Encourage, never shame.`;
}
