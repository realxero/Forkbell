import { and, eq } from 'drizzle-orm';
import { foods, type Tx } from '@forkbell/db';
import { per100Problems, type FoodInput, type Food } from '@forkbell/shared';
import { toFood } from '../serialize.ts';

export class BadFood extends Error {}

/** Save a food to the user's list, reusing an existing copy of the same outside product. */
export async function saveFood(tx: Tx, userId: string, input: FoodInput): Promise<Food> {
  const problems = per100Problems(input.per100);
  if (problems.length) throw new BadFood(problems[0]);

  if (input.sourceId && input.source !== 'custom') {
    const [existing] = await tx
      .select()
      .from(foods)
      .where(and(eq(foods.ownerId, userId), eq(foods.source, input.source), eq(foods.sourceId, input.sourceId)))
      .limit(1);
    if (existing) return toFood(existing);
  }
  const [row] = await tx
    .insert(foods)
    .values({
      ownerId: userId,
      name: input.name,
      brand: input.brand ?? null,
      source: input.source,
      sourceId: input.source === 'custom' ? null : (input.sourceId ?? null),
      kcal: input.per100.kcal,
      protein: input.per100.protein,
      carbs: input.per100.carbs,
      fat: input.per100.fat,
      fiber: input.per100.fiber ?? null,
      sugar: input.per100.sugar ?? null,
      sodiumMg: input.per100.sodium ?? null,
      servingGrams: input.servingGrams ?? null,
      servingLabel: input.servingLabel ?? null,
      barcode: input.barcode ?? (input.source === 'off' ? (input.sourceId ?? null) : null),
      portions: input.portions?.length ? input.portions : null,
    })
    .returning();
  return toFood(row!);
}
