import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Mirrors migrations/*.sql. The SQL files are the source of truth (they hold
// the row-level security policies); this is only for typed queries.

const num = (name: string) => numeric(name, { mode: 'number' });

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email'),
  name: text('name'),
  goalKcal: integer('goal_kcal'),
  goalProtein: num('goal_protein'),
  goalCarbs: num('goal_carbs'),
  goalFat: num('goal_fat'),
});

export const foods = pgTable('foods', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id'),
  name: text('name').notNull(),
  brand: text('brand'),
  source: text('source', { enum: ['custom', 'off', 'usda', 'builtin'] }).notNull(),
  sourceId: text('source_id'),
  kcal: num('kcal').notNull(),
  protein: num('protein').notNull(),
  carbs: num('carbs').notNull(),
  fat: num('fat').notNull(),
  fiber: num('fiber'),
  sugar: num('sugar'),
  sodiumMg: num('sodium_mg'),
  servingGrams: num('serving_grams'),
  servingLabel: text('serving_label'),
  barcode: text('barcode'),
  portions: jsonb('portions').$type<{ label: string; grams: number }[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const diaryEntries = pgTable('diary_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  meal: text('meal', { enum: ['breakfast', 'lunch', 'dinner', 'snacks'] }).notNull(),
  foodId: uuid('food_id').notNull(),
  grams: num('grams').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
