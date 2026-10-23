import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import { diaryEntries, foods, users, type connect } from '@forkbell/db';
import { addEntrySchema, copyMealSchema, dateSchema, sumEntries, updateEntrySchema, type DiaryDay, type DiaryEntry } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { toFood } from '../serialize.ts';
import { saveFood, BadFood } from './save-food.ts';

export function diaryRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/entry/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'That entry was not found.' }, 404);
    const [row] = await asUser(c.get('userId'), (tx) =>
      tx.select({ entry: diaryEntries, food: foods }).from(diaryEntries).innerJoin(foods, eq(foods.id, diaryEntries.foodId)).where(eq(diaryEntries.id, id)).limit(1),
    );
    if (!row) return c.json({ error: 'That entry was not found.' }, 404);
    const entry: DiaryEntry = { id: row.entry.id, date: row.entry.date, meal: row.entry.meal, grams: row.entry.grams, food: toFood(row.food) };
    return c.json({ entry });
  });

  /** Copy a meal (or a whole day) to another day. The copies are new entries you can edit freely. */
  r.post('/copy', async (c) => {
    const parsed = copyMealSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check what to copy.' }, 400);
    const { from, to, meal, toMeal } = parsed.data;
    if (from === to && (!meal || !toMeal || meal === toMeal)) return c.json({ error: 'Pick a different day or meal to copy into.' }, 400);
    // Row-level security limits the source rows to yours; user_id defaults to you.
    const copied = await asUser(c.get('userId'), (tx) =>
      tx.execute(sql`
        insert into diary_entries (date, meal, food_id, grams)
        select ${to}::date, coalesce(${toMeal ?? null}::text, meal), food_id, grams
        from diary_entries
        where date = ${from}::date and (${meal ?? null}::text is null or meal = ${meal ?? null}::text)
        order by created_at
        returning id`),
    );
    return c.json({ copied: copied.length });
  });

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
    const parsed = updateEntrySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the change.' }, 400);
    const updated = await asUser(c.get('userId'), (tx) =>
      tx.update(diaryEntries).set(parsed.data).where(and(eq(diaryEntries.id, c.req.param('id')), eq(diaryEntries.userId, c.get('userId')))).returning({ id: diaryEntries.id }),
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
