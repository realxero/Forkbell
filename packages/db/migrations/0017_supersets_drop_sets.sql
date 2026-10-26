-- Schema v17: supersets, circuits and drop sets.
--
-- Supersets: exercises in a workout with the same number go back to back, in
-- order (two is a superset, three or more a circuit). The number only means
-- "together"; it's renumbered 1, 2, 3... as the workout is saved.
alter table workout_exercises add column superset smallint check (superset between 1 and 20);

-- Drop sets: straight after the set before them, lighter, with no rest. A set
-- is a warm-up or a drop set, never both.
alter table workout_sets add column drop_set boolean not null default false;
alter table workout_sets add constraint workout_sets_warmup_or_drop check (not (warmup and drop_set));
