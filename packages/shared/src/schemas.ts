import { z } from 'zod';
import { MEALS } from './types.ts';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const num = z.number().finite().min(0);
export const per100Schema = z.object({
  kcal: num.max(900),
  protein: num.max(100),
  carbs: num.max(100),
  fat: num.max(100),
  fiber: num.max(100).nullish(),
  sugar: num.max(100).nullish(),
  sodium: num.max(100000).nullish(),
});

export const foodInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).nullish(),
  source: z.enum(['custom', 'off', 'usda']),
  sourceId: z.string().max(100).nullish(),
  per100: per100Schema,
  servingGrams: z.number().positive().max(5000).nullish(),
  servingLabel: z.string().max(100).nullish(),
});

export const addEntrySchema = z
  .object({
    date: dateSchema,
    meal: z.enum(MEALS),
    grams: z.number().positive().max(10000),
    foodId: z.string().uuid().optional(),
    /** An outside search hit: saved to your foods first, then logged. */
    food: foodInputSchema.optional(),
  })
  .refine((v) => Boolean(v.foodId) !== Boolean(v.food), 'Send either foodId or food');

export const goalsSchema = z.object({
  kcal: z.number().int().min(0).max(20000).nullable(),
  protein: z.number().min(0).max(1000).nullable(),
  carbs: z.number().min(0).max(2000).nullable(),
  fat: z.number().min(0).max(1000).nullable(),
});

export type FoodInput = z.infer<typeof foodInputSchema>;
export type AddEntryInput = z.infer<typeof addEntrySchema>;
