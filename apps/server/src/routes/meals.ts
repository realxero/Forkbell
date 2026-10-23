import { Hono } from 'hono';
import { asc, eq, inArray } from 'drizzle-orm';
import { foods, recipeItems, recipes, savedMealItems, savedMeals, type connect, type Tx } from '@forkbell/db';
import { per100Problems, recipePer100, recipeSchema, savedMealSchema, type Recipe, type SavedMeal } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { toFood } from '../serialize.ts';

/** The foods behind a list of ids that the person can see (theirs or built in). */
async function foodsById(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, ReturnType<typeof toFood>>();
  const rows = await tx.select().from(foods).where(inArray(foods.id, [...new Set(ids)]));
  return new Map(rows.map((f) => [f.id, toFood(f)]));
}

/** Saved meals: a group of foods logged together. */
export function mealRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.get('/', async (c) => {
    const meals = await asUser(c.get('profileId'), async (tx) => {
      const ms = await tx.select().from(savedMeals).orderBy(asc(savedMeals.name));
      const items = await tx.select().from(savedMealItems).orderBy(asc(savedMealItems.position));
      const byId = await foodsById(tx, items.map((i) => i.foodId));
      return ms.map((m): SavedMeal => ({
        id: m.id,
        name: m.name,
        items: items.filter((i) => i.mealId === m.id && byId.has(i.foodId)).map((i) => ({ food: byId.get(i.foodId)!, grams: i.grams })),
      }));
    });
    return c.json({ meals });
  });

  r.post('/', async (c) => {
    const parsed = savedMealSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the meal.' }, 400);
    const userId = c.get('profileId');
    const id = await asUser(userId, async (tx) => {
      const known = await foodsById(tx, parsed.data.items.map((i) => i.foodId));
      if (parsed.data.items.some((i) => !known.has(i.foodId))) return null;
      const [m] = await tx.insert(savedMeals).values({ userId, name: parsed.data.name }).returning({ id: savedMeals.id });
      await tx.insert(savedMealItems).values(parsed.data.items.map((i, position) => ({ userId, mealId: m!.id, foodId: i.foodId, grams: i.grams, position }) as typeof savedMealItems.$inferInsert));
      return m!.id;
    });
    return id ? c.json({ id }, 201) : c.json({ error: 'One of those foods was not found.' }, 404);
  });

  r.delete('/:id', async (c) => {
    const rows = await asUser(c.get('profileId'), (tx) => tx.delete(savedMeals).where(eq(savedMeals.id, c.req.param('id'))).returning({ id: savedMeals.id }));
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  return r;
}

/** Recipes: a dish built from ingredients, saved as a food you can log by the serving. */
export function recipeRoutes({ asUser }: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  const load = async (tx: Tx, onlyId?: string): Promise<Recipe[]> => {
    const rs = onlyId ? await tx.select().from(recipes).where(eq(recipes.foodId, onlyId)) : await tx.select().from(recipes);
    if (!rs.length) return [];
    const items = await tx.select().from(recipeItems).where(inArray(recipeItems.recipeId, rs.map((x) => x.foodId))).orderBy(asc(recipeItems.position));
    const byId = await foodsById(tx, [...rs.map((x) => x.foodId), ...items.map((i) => i.foodId)]);
    return rs
      .filter((x) => byId.has(x.foodId))
      .map((x) => ({
        food: byId.get(x.foodId)!,
        servings: x.servings,
        cookedGrams: x.cookedGrams,
        items: items.filter((i) => i.recipeId === x.foodId && byId.has(i.foodId)).map((i) => ({ food: byId.get(i.foodId)!, grams: i.grams })),
      }))
      .sort((a, b) => a.food.name.localeCompare(b.food.name));
  };

  /** Work out the dish's numbers from its ingredients, check them, and write the food row. */
  const write = async (tx: Tx, userId: string, input: ReturnType<typeof recipeSchema.parse>, foodId?: string) => {
    const known = await foodsById(tx, input.items.map((i) => i.foodId));
    if (input.items.some((i) => !known.has(i.foodId))) return { error: 'One of those ingredients was not found.' } as const;
    const { weight, per100 } = recipePer100(input.items.map((i) => ({ food: known.get(i.foodId)!, grams: i.grams })), input.cookedGrams);
    const bad = per100Problems(per100);
    if (bad.length) return { error: bad[0]! } as const;
    const serving = Math.round((weight / input.servings) * 10) / 10;
    const values = {
      name: input.name,
      kcal: per100.kcal,
      protein: per100.protein,
      carbs: per100.carbs,
      fat: per100.fat,
      fiber: per100.fiber,
      sugar: per100.sugar,
      sodiumMg: per100.sodium,
      servingGrams: serving,
      servingLabel: '1 serving',
      portions: [{ label: '1 serving', grams: serving }, ...(input.servings > 1 ? [{ label: `whole recipe (${input.servings} servings)`, grams: Math.round(weight) }] : [])],
    };
    let id = foodId;
    if (id) {
      await tx.update(foods).set(values).where(eq(foods.id, id));
      await tx.update(recipes).set({ servings: input.servings, cookedGrams: input.cookedGrams ?? null }).where(eq(recipes.foodId, id));
      await tx.delete(recipeItems).where(eq(recipeItems.recipeId, id));
    } else {
      const [f] = await tx.insert(foods).values({ ...values, ownerId: userId, source: 'recipe', brand: null, sourceId: null, barcode: null } as typeof foods.$inferInsert).returning({ id: foods.id });
      id = f!.id;
      await tx.insert(recipes).values({ foodId: id, userId, servings: input.servings, cookedGrams: input.cookedGrams ?? null } as typeof recipes.$inferInsert);
    }
    await tx.insert(recipeItems).values(input.items.map((i, position) => ({ userId, recipeId: id!, foodId: i.foodId, grams: i.grams, position }) as typeof recipeItems.$inferInsert));
    return { id } as const;
  };

  r.get('/', async (c) => c.json({ recipes: await asUser(c.get('profileId'), (tx) => load(tx)) }));

  r.post('/', async (c) => {
    const parsed = recipeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the recipe.' }, 400);
    const userId = c.get('profileId');
    const out = await asUser(userId, async (tx) => {
      const w = await write(tx, userId, parsed.data);
      return 'error' in w ? w : { recipe: (await load(tx, w.id))[0]! };
    });
    return 'error' in out ? c.json(out, 400) : c.json(out, 201);
  });

  /** Changing a recipe changes the food, so earlier diary entries of it follow the new numbers. */
  r.put('/:id', async (c) => {
    const parsed = recipeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the recipe.' }, 400);
    const userId = c.get('profileId');
    const out = await asUser(userId, async (tx) => {
      const [exists] = await tx.select({ id: recipes.foodId }).from(recipes).where(eq(recipes.foodId, c.req.param('id'))).limit(1);
      if (!exists) return { error: 'Not found.', status: 404 as const };
      const w = await write(tx, userId, parsed.data, exists.id);
      return 'error' in w ? { ...w, status: 400 as const } : { recipe: (await load(tx, w.id))[0]! };
    });
    return 'error' in out ? c.json({ error: out.error }, out.status) : c.json(out);
  });

  /** Stop treating it as a recipe. The food stays, so your diary history keeps its numbers. */
  r.delete('/:id', async (c) => {
    const rows = await asUser(c.get('profileId'), (tx) => tx.delete(recipes).where(eq(recipes.foodId, c.req.param('id'))).returning({ id: recipes.foodId }));
    return rows.length ? c.json({ ok: true }) : c.json({ error: 'Not found.' }, 404);
  });

  return r;
}
