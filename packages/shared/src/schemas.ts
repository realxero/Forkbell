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
  satFat: num.max(100).nullish(),
});

export const foodInputSchema = z.object({
  /** made on the device for foods created offline, so a resend can't duplicate it */
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(200).nullish(),
  source: z.enum(['custom', 'off', 'usda']),
  sourceId: z.string().max(100).nullish(),
  per100: per100Schema,
  servingGrams: z.number().positive().max(5000).nullish(),
  servingLabel: z.string().max(100).nullish(),
  barcode: z.string().regex(/^\d{6,14}$/, 'A barcode is 6 to 14 digits.').nullish(),
  portions: z.array(z.object({ label: z.string().trim().min(1).max(60), grams: z.number().positive().max(5000) })).max(20).nullish(),
});

export const addEntrySchema = z
  .object({
    /** made on the device, so sending the same entry twice logs it once */
    id: z.string().uuid().optional(),
    date: dateSchema,
    meal: z.enum(MEALS),
    grams: z.number().positive('Enter an amount above 0.').max(10000, 'That is more than 10 kg.'),
    foodId: z.string().uuid().optional(),
    /** An outside search hit: saved to your foods first, then logged. */
    food: foodInputSchema.optional(),
  })
  .refine((v) => Boolean(v.foodId) !== Boolean(v.food), 'Send either foodId or food');

export const copyMealSchema = z.object({
  from: dateSchema,
  to: dateSchema,
  /** copy one meal; leave out to copy the whole day */
  meal: z.enum(MEALS).optional(),
  /** put the copies in a different meal */
  toMeal: z.enum(MEALS).optional(),
});

export const updateEntrySchema = z
  .object({
    grams: z.number().positive('Enter an amount above 0.').max(10000, 'That is more than 10 kg.').optional(),
    meal: z.enum(MEALS).optional(),
    /** point the entry at another food, e.g. an edited copy with corrected numbers */
    foodId: z.string().uuid().optional(),
  })
  .refine((v) => v.grams !== undefined || v.meal !== undefined || v.foodId !== undefined, 'Nothing to change.');

const itemSchema = z.object({ foodId: z.string().uuid(), grams: z.number().positive().max(10000) });

export const savedMealSchema = z.object({
  name: z.string().trim().min(1, 'Give the meal a name.').max(80),
  items: z.array(itemSchema).min(1, 'Add at least one food.').max(40),
});

export const recipeSchema = z.object({
  name: z.string().trim().min(1, 'Give the recipe a name.').max(200),
  servings: z.number().positive().max(100),
  /** weight of the finished dish, if you weighed it after cooking */
  cookedGrams: z.number().positive().max(50000).nullish(),
  items: z.array(itemSchema).min(1, 'Add at least one ingredient.').max(60),
});

export const goalsSchema = z.object({
  kcal: z.number().int().min(0).max(20000).nullable(),
  protein: z.number().min(0).max(1000).nullable(),
  carbs: z.number().min(0).max(2000).nullable(),
  fat: z.number().min(0).max(1000).nullable(),
});

export type FoodInput = z.infer<typeof foodInputSchema>;
export type AddEntryInput = z.infer<typeof addEntrySchema>;
export type CopyMealInput = z.infer<typeof copyMealSchema>;
