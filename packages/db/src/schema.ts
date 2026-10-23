import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

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
  weightUnit: text('weight_unit', { enum: ['lb', 'kg'] }).notNull(),
  goalWeightKg: num('goal_weight_kg'),
  goalDate: date('goal_date', { mode: 'string' }),
  weeklyWorkoutGoal: integer('weekly_workout_goal').notNull(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull(),
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

export const exercises = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id'),
  source: text('source', { enum: ['builtin', 'custom'] }).notNull(),
  key: text('key'),
  name: text('name').notNull(),
  muscle: text('muscle').notNull(),
  equipment: text('equipment').notNull(),
  kind: text('kind', { enum: ['weight', 'bodyweight', 'time'] }).notNull(),
  increment: text('increment', { enum: ['small', 'large'] }).notNull(),
  restSeconds: integer('rest_seconds').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const programs = pgTable('programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  active: boolean('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const routines = pgTable('routines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  programId: uuid('program_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
});

export const routineExercises = pgTable('routine_exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  routineId: uuid('routine_id').notNull(),
  exerciseId: uuid('exercise_id').notNull(),
  position: integer('position').notNull(),
  sets: integer('sets').notNull(),
  repMin: integer('rep_min').notNull(),
  repMax: integer('rep_max').notNull(),
  restSeconds: integer('rest_seconds').notNull(),
});

export const workouts = pgTable('workouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  name: text('name').notNull(),
  routineId: uuid('routine_id'),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
  notes: text('notes'),
});

export const workoutExercises = pgTable('workout_exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  workoutId: uuid('workout_id').notNull(),
  exerciseId: uuid('exercise_id').notNull(),
  position: integer('position').notNull(),
  restSeconds: integer('rest_seconds').notNull(),
  targetSets: integer('target_sets'),
  repMin: integer('rep_min'),
  repMax: integer('rep_max'),
  pain: boolean('pain').notNull(),
  painNote: text('pain_note'),
});

export const workoutSets = pgTable('workout_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  workoutExerciseId: uuid('workout_exercise_id').notNull(),
  position: integer('position').notNull(),
  weightKg: num('weight_kg'),
  reps: integer('reps'),
  seconds: integer('seconds'),
  rpe: num('rpe'),
  warmup: boolean('warmup').notNull(),
  done: boolean('done').notNull(),
});

export const weighIns = pgTable('weigh_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  weightKg: num('weight_kg').notNull(),
  bodyFat: num('body_fat'),
  source: text('source', { enum: ['manual', 'apple_health', 'health_connect'] }).notNull(),
});

export const healthDaily = pgTable('health_daily', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  kind: text('kind', { enum: ['steps', 'active_kcal', 'resting_kcal', 'resting_hr'] }).notNull(),
  value: num('value').notNull(),
  source: text('source', { enum: ['apple_health', 'health_connect'] }).notNull(),
});

export const measurements = pgTable('measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  kind: text('kind').notNull(),
  valueCm: num('value_cm').notNull(),
});
