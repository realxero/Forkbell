import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { diaryEntries, foods, users, type connect } from '@forkbell/db';
import { addEntrySchema, dateSchema, sumEntries, type DiaryDay, type DiaryEntry } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { toFood } from '../serialize.ts';
import { saveFood, BadFood } from './save-food.ts';

export function diaryRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/:date', async (c) => {
    const date = dateSchema.safeParse(c.req.param('date'));
    if (!date.success) return c.json({ error: 'Use a date like 2026-10-22.' }, 400);
    const day = await asUser(c.get('userId'), async (tx): Promise<DiaryDay> => {
      // Row-level security already limits this to the signed-in user's rows.
      const rows = await tx
        .select({ entry: diaryEntries, food: foods })
        .from(diaryEntries)
        .innerJoin(foods, eq(foods.id, diaryEntries.foodId))
        .where(eq(diaryEntries.date, date.data))
        .orderBy(asc(diaryEntries.createdAt));
      const [me] = await tx.select().from(users).where(eq(users.id, c.get('userId'))).limit(1);
      const entries: DiaryEntry[] = rows.map(({ entry, food }) => ({
        id: entry.id,
        date: entry.date,
        meal: entry.meal,
        grams: entry.grams,
        food: toFood(food),
      }));
      return {
        date: date.data,
        entries,
        totals: sumEntries(entries),
        goals: { kcal: me?.goalKcal ?? null, protein: me?.goalProtein ?? null, carbs: me?.goalCarbs ?? null, fat: me?.goalFat ?? null },
      };
    });
    return c.json(day);
  });

  r.post('/', async (c) => {
    const parsed = addEntrySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the entry.' }, 400);
    const input = parsed.data;
    const userId = c.get('userId');
    try {
      const entry = await asUser(userId, async (tx) => {
        let foodId = input.foodId;
        if (input.food) foodId = (await saveFood(tx, userId, input.food)).id;
        const [food] = await tx.select().from(foods).where(eq(foods.id, foodId!)).limit(1);
        if (!food) return null; // not yours and not built in: RLS hides it
        const [row] = await tx
          .insert(diaryEntries)
          .values({ userId, date: input.date, meal: input.meal, grams: input.grams, foodId: food.id })
          .returning();
        return { id: row!.id, date: row!.date, meal: row!.meal, grams: row!.grams, food: toFood(food) } satisfies DiaryEntry;
      });
      if (!entry) return c.json({ error: 'That food was not found.' }, 404);
      return c.json({ entry }, 201);
    } catch (err) {
      if (err instanceof BadFood) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  r.patch('/:id', async (c) => {
    const body = await c.req.json<{ grams?: number; meal?: string }>().catch(() => ({}) as { grams?: number; meal?: string });
    const patch: { grams?: number; meal?: DiaryEntry['meal'] } = {};
    if (typeof body.grams === 'number' && body.grams > 0 && body.grams <= 10000) patch.grams = body.grams;
    if (body.meal && ['breakfast', 'lunch', 'dinner', 'snacks'].includes(body.meal)) patch.meal = body.meal as DiaryEntry['meal'];
    if (!Object.keys(patch).length) return c.json({ error: 'Nothing to change.' }, 400);
    const updated = await asUser(c.get('userId'), (tx) =>
      tx.update(diaryEntries).set(patch).where(and(eq(diaryEntries.id, c.req.param('id')), eq(diaryEntries.userId, c.get('userId')))).returning({ id: diaryEntries.id }),
    );
    return updated.length ? c.json({ ok: true }) : c.json({ error: 'That entry was not found.' }, 404);
  });

  r.delete('/:id', async (c) => {
    const deleted = await asUser(c.get('userId'), (tx) =>
      tx.delete(diaryEntries).where(and(eq(diaryEntries.id, c.req.param('id')), eq(diaryEntries.userId, c.get('userId')))).returning({ id: diaryEntries.id }),
    );
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'That entry was not found.' }, 404);
  });

  return r;
}
