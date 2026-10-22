import { Hono } from 'hono';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { foods, type connect } from '@forkbell/db';
import { foodInputSchema, type FoodCandidate } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { toFood } from '../serialize.ts';
import { searchOff, barcodeOff } from '../providers/off.ts';
import { searchUsda } from '../providers/usda.ts';
import { env } from '../env.ts';
import { saveFood } from './save-food.ts';

export function foodRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** Your own foods first, then outside databases. One failing source never sinks the search. */
  r.get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 2) return c.json({ mine: [], results: [], errors: [] });
    const userId = c.get('userId');

    const minePromise = asUser(userId, (tx) =>
      tx
        .select()
        .from(foods)
        .where(and(or(eq(foods.ownerId, userId), isNull(foods.ownerId)), ilike(foods.name, `%${q.replace(/[%_\\]/g, '\\$&')}%`)))
        .orderBy(desc(foods.createdAt))
        .limit(15),
    );
    const outside = await Promise.allSettled([
      searchOff(q),
      env.usdaApiKey ? searchUsda(q, env.usdaApiKey) : Promise.resolve([] as FoodCandidate[]),
    ]);
    const mine = (await minePromise).map(toFood);
    const saved = new Set(mine.map((f) => `${f.source}:${f.sourceId}`));
    const results = outside
      .flatMap((o) => (o.status === 'fulfilled' ? o.value : []))
      .filter((f) => !saved.has(`${f.source}:${f.sourceId}`));
    const errors = outside.flatMap((o, i) => (o.status === 'rejected' ? [i === 0 ? 'Open Food Facts is not answering.' : 'USDA is not answering.'] : []));
    return c.json({ mine, results, errors });
  });

  r.get('/barcode/:code', async (c) => {
    const code = c.req.param('code');
    if (!/^\d{6,14}$/.test(code)) return c.json({ error: 'That is not a barcode number.' }, 400);
    const userId = c.get('userId');
    const [mine] = await asUser(userId, (tx) =>
      tx.select().from(foods).where(and(eq(foods.ownerId, userId), eq(foods.source, 'off'), eq(foods.sourceId, code))).limit(1),
    );
    if (mine) return c.json({ food: toFood(mine) });
    const found = await barcodeOff(code);
    if (!found) return c.json({ error: 'No product with that barcode. Add it as your own food.' }, 404);
    return c.json({ candidate: found });
  });

  r.post('/', async (c) => {
    const parsed = foodInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the food details.' }, 400);
    const food = await asUser(c.get('userId'), (tx) => saveFood(tx, c.get('userId'), parsed.data));
    return c.json({ food }, 201);
  });

  return r;
}
