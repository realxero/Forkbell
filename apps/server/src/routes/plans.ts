// A weekly meal plan and suggested targets: kept by you, or by someone you
// invited to plan your food (food_plan). Neither logs anything or changes
// your goals; you log a planned meal, or apply suggested targets, yourself.
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { mealPlan, savedMeals, targetSuggestions, type connect } from '@forkbell/db';
import { mealPlanCellSchema, targetSuggestionSchema, type MealPlanCell, type TargetSuggestion } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';

export function planRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/meal-plan', async (c) => {
    const owner = c.get('profileId');
    const rows = await asUser(owner, (tx) =>
      tx.select({ p: mealPlan, name: savedMeals.name }).from(mealPlan).leftJoin(savedMeals, eq(savedMeals.id, mealPlan.savedMealId)),
    );
    const cells: MealPlanCell[] = rows.map(({ p, name }) => ({
      weekday: p.weekday,
      meal: p.meal as MealPlanCell['meal'],
      note: p.note,
      savedMealId: p.savedMealId,
      savedMealName: name,
      fromCoach: p.createdBy !== null && p.createdBy !== owner,
    }));
    return c.json({ cells });
  });

  /** Set one weekday's meal; with no note and no saved meal, it's cleared. */
  r.put('/meal-plan', async (c) => {
    const parsed = mealPlanCellSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the plan.' }, 400);
    const { weekday, meal, note, savedMealId } = parsed.data;
    const where = and(eq(mealPlan.weekday, weekday), eq(mealPlan.meal, meal));
    await asUser(c.get('profileId'), async (tx) => {
      if (!note && !savedMealId) return tx.delete(mealPlan).where(where);
      return tx
        .insert(mealPlan)
        .values({ weekday, meal, note: note || null, savedMealId } as typeof mealPlan.$inferInsert)
        .onConflictDoUpdate({ target: [mealPlan.userId, mealPlan.weekday, mealPlan.meal], set: { note: note || null, savedMealId } });
    });
    return c.json({ ok: true });
  });

  r.get('/coach-targets', async (c) => {
    const owner = c.get('profileId');
    const [row] = await asUser(owner, (tx) => tx.select().from(targetSuggestions).limit(1));
    const suggestion: TargetSuggestion | null = row
      ? { kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat, note: row.note, fromCoach: row.createdBy !== null && row.createdBy !== owner }
      : null;
    return c.json({ suggestion });
  });

  r.put('/coach-targets', async (c) => {
    const parsed = targetSuggestionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the targets.' }, 400);
    const v = { ...parsed.data, note: parsed.data.note || null };
    await asUser(c.get('profileId'), (tx) =>
      tx.insert(targetSuggestions).values(v as typeof targetSuggestions.$inferInsert).onConflictDoUpdate({ target: targetSuggestions.userId, set: { ...v, createdAt: new Date().toISOString() } }),
    );
    return c.json({ ok: true });
  });

  /** Applied or dismissed: the suggestion goes. */
  r.delete('/coach-targets', async (c) => {
    await asUser(c.get('profileId'), (tx) => tx.delete(targetSuggestions));
    return c.json({ ok: true });
  });

  return r;
}
