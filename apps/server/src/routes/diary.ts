import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import { dayStatus, diaryEntries, foods, users, type connect } from '@forkbell/db';
import { addEntrySchema, copyMealSchema, dateSchema, sumEntries, updateEntrySchema, type DiaryDay, type DiaryEntry } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { toFood } from '../serialize.ts';
import { saveFood, BadFood } from './save-food.ts';

/** The goals for a date: that weekday's own goals if set, otherwise the everyday ones. */
function goalsFor(date: string, me: typeof users.$inferSelect | undefined): DiaryDay['goals'] {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = String(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
  const special = (me?.weekdayGoals as Record<string, DiaryDay['goals']> | undefined)?.[weekday];
  return special ?? { kcal: me?.goalKcal ?? null, protein: me?.goalProtein ?? null, carbs: me?.goalCarbs ?? null, fat: me?.goalFat ?? null };
}

export function diaryRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  /** Calories and macros per day, for sending to Apple Health or Health Connect. */
  r.get('/totals', async (c) => {
    const from = dateSchema.safeParse(c.req.query('from'));
    const to = dateSchema.safeParse(c.req.query('to'));
    if (!from.success || !to.success || from.data > to.data) return c.json({ error: 'Use from and to dates like 2026-10-22.' }, 400);
    const rows = await asUser(c.get('profileId'), (tx) =>
      tx
        .select({ entry: diaryEntries, food: foods })
        .from(diaryEntries)
        .innerJoin(foods, eq(foods.id, diaryEntries.foodId))
        .where(sql`${diaryEntries.date} between ${from.data}::date and ${to.data}::date`),
    );
    const finished = await asUser(c.get('profileId'), (tx) =>
      tx.select({ date: dayStatus.date }).from(dayStatus).where(sql`${dayStatus.date} between ${from.data}::date and ${to.data}::date`),
    );
    const done = new Set(finished.map((f) => f.date));
    const byDate = new Map<string, { grams: number; food: ReturnType<typeof toFood> }[]>();
    for (const { entry, food } of rows) byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), { grams: entry.grams, food: toFood(food) }]);
    return c.json({ days: [...byDate.entries()].sort().map(([date, entries]) => ({ date, totals: sumEntries(entries), complete: done.has(date) })) });
  });

  r.get('/entry/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'That entry was not found.' }, 404);
    const [row] = await asUser(c.get('profileId'), (tx) =>
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
    const copied = await asUser(c.get('profileId'), (tx) =>
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

  /** Mark a day finished (everything eaten is logged), or reopen it. */
  r.put('/:date/complete', async (c) => {
    const date = dateSchema.safeParse(c.req.param('date'));
    if (!date.success) return c.json({ error: 'Use a date like 2026-10-22.' }, 400);
    await asUser(c.get('profileId'), (tx) => tx.execute(sql`insert into day_status (date) values (${date.data}::date) on conflict do nothing`));
    return c.json({ date: date.data, complete: true });
  });
  r.delete('/:date/complete', async (c) => {
    const date = dateSchema.safeParse(c.req.param('date'));
    if (!date.success) return c.json({ error: 'Use a date like 2026-10-22.' }, 400);
    await asUser(c.get('profileId'), (tx) => tx.delete(dayStatus).where(eq(dayStatus.date, date.data)));
    return c.json({ date: date.data, complete: false });
  });

  /**
   * When you usually log each meal and finish your day, as raw times over the
   * last four weeks. The phone works out typical times in its own time zone.
   */
  r.get('/habits', async (c) => {
    const rows = await asUser(c.get('profileId'), (tx) =>
      tx.execute<{ date: string; meal: string; at: string }>(sql`
        select date::text as date, meal, min(created_at) as at from diary_entries
        where date >= current_date - 28 and created_at is not null
        group by date, meal`),
    );
    const finished = await asUser(c.get('profileId'), (tx) =>
      tx.execute<{ date: string; at: string }>(sql`select date::text as date, completed_at as at from day_status where date >= current_date - 28`),
    );
    return c.json({
      firsts: [...rows].map((r) => ({ date: r.date, meal: r.meal, at: new Date(r.at).toISOString() })),
      finished: [...finished].map((r) => ({ date: r.date, at: new Date(r.at).toISOString() })),
    });
  });

  r.get('/:date', async (c) => {
    const date = dateSchema.safeParse(c.req.param('date'));
    if (!date.success) return c.json({ error: 'Use a date like 2026-10-22.' }, 400);
    const day = await asUser(c.get('profileId'), async (tx): Promise<DiaryDay> => {
      // Row-level security already limits this to the signed-in user's rows.
      const rows = await tx
        .select({ entry: diaryEntries, food: foods })
        .from(diaryEntries)
        .innerJoin(foods, eq(foods.id, diaryEntries.foodId))
        .where(eq(diaryEntries.date, date.data))
        .orderBy(asc(diaryEntries.createdAt));
      const [me] = await tx.select().from(users).where(eq(users.id, c.get('profileId'))).limit(1);
      const [finished] = await tx.select({ date: dayStatus.date }).from(dayStatus).where(eq(dayStatus.date, date.data)).limit(1);
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
        goals: goalsFor(date.data, me),
        complete: Boolean(finished),
      };
    });
    return c.json(day);
  });

  r.post('/', async (c) => {
    const parsed = addEntrySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the entry.' }, 400);
    const input = parsed.data;
    const userId = c.get('profileId');
    try {
      const entry = await asUser(userId, async (tx) => {
        if (input.id) {
          // Sent before (the answer was lost on a bad connection): return what's there.
          const [prior] = await tx.select({ entry: diaryEntries, food: foods }).from(diaryEntries).innerJoin(foods, eq(foods.id, diaryEntries.foodId)).where(eq(diaryEntries.id, input.id)).limit(1);
          if (prior) return { id: prior.entry.id, date: prior.entry.date, meal: prior.entry.meal, grams: prior.entry.grams, food: toFood(prior.food) } satisfies DiaryEntry;
        }
        let foodId = input.foodId;
        if (input.food) foodId = (await saveFood(tx, userId, input.food)).id;
        const [food] = await tx.select().from(foods).where(eq(foods.id, foodId!)).limit(1);
        if (!food) return null; // not yours and not built in: RLS hides it
        const [row] = await tx
          .insert(diaryEntries)
          .values({ ...(input.id ? { id: input.id } : {}), userId, date: input.date, meal: input.meal, grams: input.grams, foodId: food.id })
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
    const updated = await asUser(c.get('profileId'), (tx) =>
      tx.update(diaryEntries).set(parsed.data).where(and(eq(diaryEntries.id, c.req.param('id')), eq(diaryEntries.userId, c.get('profileId')))).returning({ id: diaryEntries.id }),
    );
    return updated.length ? c.json({ ok: true }) : c.json({ error: 'That entry was not found.' }, 404);
  });

  r.delete('/:id', async (c) => {
    const deleted = await asUser(c.get('profileId'), (tx) =>
      tx.delete(diaryEntries).where(and(eq(diaryEntries.id, c.req.param('id')), eq(diaryEntries.userId, c.get('profileId')))).returning({ id: diaryEntries.id }),
    );
    return deleted.length ? c.json({ ok: true }) : c.json({ error: 'That entry was not found.' }, 404);
  });

  return r;
}
