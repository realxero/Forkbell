-- Schema v21: supersets in a program's days, so a workout started from the
-- day is set up with them. Same meaning as workout_exercises.superset.
alter table routine_exercises add column superset smallint check (superset between 1 and 20);
