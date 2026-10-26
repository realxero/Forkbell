-- Schema v20: cardio.
--
-- Cardio exercises (runs, rides, rows...) are logged as a time and, when it
-- makes sense, a distance. The time is the set's seconds; the distance is new.
alter table exercises drop constraint exercises_kind_check;
alter table exercises add constraint exercises_kind_check check (kind in ('weight', 'bodyweight', 'time', 'cardio'));
alter table workout_sets add column distance_m numeric(10,1) check (distance_m >= 0 and distance_m <= 1000000);
