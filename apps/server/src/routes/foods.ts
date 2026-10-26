import { Hono } from 'hono';
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { diaryEntries, foods, type connect } from '@forkbell/db';
import { addDays, barcodeVariants, chooseBarcodeMatch, crossCheck, rankResults, dateSchema, foodInputSchema, todayLocal, type FoodCandidate, type RecentFood, type RecentFoods } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { toFood } from '../serialize.ts';
import { searchOff, barcodeOff } from '../providers/off.ts';
import { barcodeUsda, searchUsda } from '../providers/usda.ts';
import { env } from '../env.ts';
import { saveFood, BadFood } from './save-food.ts';

const likeEscape = (s: string) => s.replace(/[%_\\]/g, '\\$&');

export function foodRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /**
   * Your own and built-in foods first, then outside databases. One failing
   * source never sinks the search.
   */
  r.get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 2) return c.json({ mine: [], results: [], errors: [] });
    const userId = c.get('profileId');
    const like = `%${likeEscape(q)}%`;
    const prefix = `${likeEscape(q)}%`;

    const minePromise = asUser(userId, (tx) =>
      tx
        .select()
        .from(foods)
        .where(and(or(eq(foods.ownerId, userId), isNull(foods.ownerId)), or(ilike(foods.name, like), ilike(foods.brand, like))))
        // yours before built-in, then names that start with the query, then shorter names
        .orderBy(sql`${foods.ownerId} is null`, sql`${foods.name} not ilike ${prefix}`, sql`length(${foods.name})`, desc(foods.createdAt))
        .limit(20),
    );
    const outside = await Promise.allSettled([
      searchOff(q),
      env.usdaApiKey ? searchUsda(q, env.usdaApiKey) : Promise.resolve([] as FoodCandidate[]),
    ]);
    const mine = (await minePromise).map(toFood);
    const saved = new Set(mine.map((f) => `${f.source}:${f.sourceId}`));
    // Best match first, and among similar matches the more trustworthy data.
    const results = rankResults(
      q,
      outside.flatMap((o) => (o.status === 'fulfilled' ? o.value : [])).filter((f) => !saved.has(`${f.source}:${f.sourceId}`)),
    );
    const errors = outside.flatMap((o, i) => (o.status === 'rejected' ? [i === 0 ? 'Open Food Facts is not answering.' : 'USDA is not answering.'] : []));
    return c.json({ mine, results, errors });
  });

  /** Your own foods and the built-in ones, kept on the device so search works offline. */
  r.get('/library', async (c) => {
    const userId = c.get('profileId');
    const rows = await asUser(userId, (tx) =>
      tx.select().from(foods).where(or(eq(foods.ownerId, userId), isNull(foods.ownerId))).orderBy(desc(foods.createdAt)).limit(2000),
    );
    return c.json({ foods: rows.map(toFood) });
  });

  /** Foods you've logged lately, with the amount you used last time. */
  r.get('/recent', async (c) => {
    const userId = c.get('profileId');
    // The phone's own date, so "60 days" follows your time zone, not the server's.
    const today = dateSchema.safeParse(c.req.query('today'));
    const since = addDays(today.success ? today.data : todayLocal(), -60);
    const rows = await asUser(userId, (tx) =>
      tx
        .select({
          food: foods,
          lastUsed: sql<string>`max(${diaryEntries.createdAt})`,
          uses: sql<number>`count(*)::int`,
          lastGrams: sql<string>`(array_agg(${diaryEntries.grams} order by ${diaryEntries.createdAt} desc))[1]`,
          lastMeal: sql<RecentFood['lastMeal']>`(array_agg(${diaryEntries.meal} order by ${diaryEntries.createdAt} desc))[1]`,
          lastAmount: sql<string | null>`(array_agg(${diaryEntries.amount} order by ${diaryEntries.createdAt} desc))[1]`,
          lastUnit: sql<string | null>`(array_agg(${diaryEntries.unit} order by ${diaryEntries.createdAt} desc))[1]`,
        })
        .from(diaryEntries)
        .innerJoin(foods, eq(foods.id, diaryEntries.foodId))
        .where(gte(diaryEntries.date, since))
        .groupBy(foods.id),
    );
    const all: (RecentFood & { lastUsed: string })[] = rows.map((r) => ({
      food: toFood(r.food),
      lastGrams: Number(r.lastGrams),
      lastAmount: r.lastAmount == null ? null : Number(r.lastAmount),
      lastUnit: r.lastUnit ?? null,
      lastMeal: r.lastMeal,
      uses: r.uses,
      lastUsed: r.lastUsed,
    }));
    const strip = ({ lastUsed: _, ...rest }: RecentFood & { lastUsed: string }): RecentFood => rest;
    const body: RecentFoods = {
      recent: [...all].sort((a, b) => (a.lastUsed < b.lastUsed ? 1 : -1)).slice(0, 15).map(strip),
      frequent: all.filter((f) => f.uses >= 2).sort((a, b) => b.uses - a.uses).slice(0, 15).map(strip),
    };
    return c.json(body);
  });

  /**
   * Your saved foods first (including ones you created with that barcode). Then
   * Open Food Facts and USDA together: USDA's branded foods come from the maker's
   * label, so they win when both have it, and the other is used as a check.
   */
  r.get('/barcode/:code', async (c) => {
    const codes = barcodeVariants(c.req.param('code'));
    if (!codes.length) return c.json({ error: 'That is not a barcode number.' }, 400);
    const userId = c.get('profileId');
    const [mine] = await asUser(userId, (tx) =>
      tx.select().from(foods).where(and(eq(foods.ownerId, userId), inArray(foods.barcode, codes))).orderBy(desc(foods.createdAt)).limit(1),
    );
    if (mine) return c.json({ food: toFood(mine) });
    const [off, usda] = await Promise.allSettled([barcodeOff(codes), env.usdaApiKey ? barcodeUsda(codes, env.usdaApiKey) : Promise.resolve(null)]);
    const found = { off: off.status === 'fulfilled' ? off.value : null, usda: usda.status === 'fulfilled' ? usda.value : null };
    const { pick, other } = chooseBarcodeMatch(found);
    if (!pick) {
      const down = off.status === 'rejected' && (usda.status === 'rejected' || !env.usdaApiKey);
      return down
        ? c.json({ error: 'The food databases aren’t answering. Try again, or add the food yourself.', barcode: codes[0] }, 502)
        : c.json({ error: 'No product with that barcode yet. Add it as your own food and it will scan next time.', barcode: codes[0] }, 404);
    }
    return c.json({ candidate: { ...pick, barcode: pick.barcode ?? codes[0] }, check: crossCheck(pick, other) });
  });

  r.post('/', async (c) => {
    const parsed = foodInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the food details.' }, 400);
    try {
      const food = await asUser(c.get('profileId'), (tx) => saveFood(tx, c.get('profileId'), parsed.data));
      return c.json({ food }, 201);
    } catch (err) {
      if (err instanceof BadFood) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  return r;
}
