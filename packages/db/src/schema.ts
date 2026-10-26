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
  weekdayGoals: jsonb('weekday_goals').$type<Record<string, unknown>>().notNull(),
});

export const foods = pgTable('foods', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id'),
  name: text('name').notNull(),
  brand: text('brand'),
  source: text('source', { enum: ['custom', 'off', 'usda', 'builtin', 'recipe'] }).notNull(),
  sourceId: text('source_id'),
  kcal: num('kcal').notNull(),
  protein: num('protein').notNull(),
  carbs: num('carbs').notNull(),
  fat: num('fat').notNull(),
  fiber: num('fiber'),
  sugar: num('sugar'),
  sodiumMg: num('sodium_mg'),
  /** vitamins and minerals per 100 g, mg or µg */
  micros: jsonb('micros').$type<Record<string, number | null>>(),
  satFat: num('sat_fat'),
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
  /** how the amount was said: 1 (amount) bar (unit); grams stays the truth */
  amount: num('amount'),
  unit: text('unit'),
  /** this entry's own name, instead of the food's */
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** A row means that day's food log is finished. */
export const dayStatus = pgTable('day_status', {
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id'),
  source: text('source', { enum: ['builtin', 'custom'] }).notNull(),
  key: text('key'),
  name: text('name').notNull(),
  muscle: text('muscle').notNull(),
  equipment: text('equipment').notNull(),
  kind: text('kind', { enum: ['weight', 'bodyweight', 'time', 'cardio'] }).notNull(),
  increment: text('increment', { enum: ['small', 'large'] }).notNull(),
  restSeconds: integer('rest_seconds').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  /** part of the big searchable library rather than the everyday list */
  library: boolean('library').notNull().default(false),
  /** the Free Exercise DB entry its steps and pictures come from */
  howToRef: text('how_to_ref'),
  level: text('level'),
  secondaryMuscles: text('secondary_muscles').array().notNull().default([]),
  steps: text('steps').array().notNull().default([]),
  imageCount: integer('image_count').notNull().default(0),
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
  /** exercises with the same number are a superset or circuit */
  superset: integer('superset'),
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
  /** exercises with the same number are done back to back */
  superset: integer('superset'),
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
  /** straight after the set before it, lighter, no rest */
  drop: boolean('drop_set').notNull().default(false),
  /** cardio: metres covered */
  distanceM: num('distance_m'),
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
  kind: text('kind').notNull(),
  value: num('value').notNull(),
  source: text('source', { enum: ['apple_health', 'health_connect'] }).notNull(),
});

export const measurements = pgTable('measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  kind: text('kind').notNull(),
  value: num('value').notNull(),
  unit: text('unit').notNull(),
});

export const shares = pgTable('shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  granteeId: uuid('grantee_id').notNull(),
  permissions: text('permissions').array().notNull(),
});

export const shareInvites = pgTable('share_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  codeHash: text('code_hash').notNull(),
  permissions: text('permissions').array().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
});

export const checkIns = pgTable('check_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  sleepHours: num('sleep_hours'),
  sleepQuality: integer('sleep_quality'),
  mood: integer('mood'),
  energy: integer('energy'),
  note: text('note'),
});

export const medications = pgTable('medications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  dose: text('dose'),
  timesPerDay: integer('times_per_day').notNull(),
  notes: text('notes'),
  active: boolean('active').notNull(),
  /** "HH:MM" per dose, '' for a dose without a reminder */
  reminderTimes: text('reminder_times').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const medicationLogs = pgTable('medication_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  medicationId: uuid('medication_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  slot: integer('slot').notNull(),
  status: text('status', { enum: ['taken', 'skipped'] }).notNull(),
});

export const savedMeals = pgTable('saved_meals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const savedMealItems = pgTable('saved_meal_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  mealId: uuid('meal_id').notNull(),
  foodId: uuid('food_id').notNull(),
  grams: num('grams').notNull(),
  position: integer('position').notNull(),
});

export const recipes = pgTable('recipes', {
  foodId: uuid('food_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  servings: num('servings').notNull(),
  cookedGrams: num('cooked_grams'),
});

export const recipeItems = pgTable('recipe_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  recipeId: uuid('recipe_id').notNull(),
  foodId: uuid('food_id').notNull(),
  grams: num('grams').notNull(),
  position: integer('position').notNull(),
});

export const aiSettings = pgTable('ai_settings', {
  userId: uuid('user_id').primaryKey(),
  provider: text('provider', { enum: ['gemini', 'anthropic', 'openai', 'custom'] }).notNull(),
  model: text('model').notNull(),
  baseUrl: text('base_url'),
  keyCiphertext: text('key_ciphertext'),
  keyHint: text('key_hint'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

/** Keys for Siri and the Shortcuts app: sessions that only work on /api/shortcuts. */
export const shortcutKeys = pgTable('shortcut_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull(),
  hint: text('hint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'string' }),
});

/** Water: one row per glass or bottle. */
export const waterEntries = pgTable('water_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  ml: integer('ml').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

/** Progress photos. The image itself (bytea) is read and written with plain SQL, so lists stay light. */
export const progressPhotos = pgTable('progress_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  pose: text('pose').notNull(),
  mime: text('mime').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

/** Fasts: a start, a goal in hours, and an end once it's over. */
export const fasts = pgTable('fasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
  targetHours: num('target_hours').notNull(),
});
