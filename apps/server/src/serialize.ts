import type { Food } from '@forkbell/shared';
import type { foods } from '@forkbell/db';

type FoodRow = typeof foods.$inferSelect;

export function toFood(r: FoodRow): Food {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    source: r.source,
    sourceId: r.sourceId,
    per100: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, sugar: r.sugar, sodium: r.sodiumMg },
    servingGrams: r.servingGrams,
    servingLabel: r.servingLabel,
  };
}
