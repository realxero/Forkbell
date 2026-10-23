-- Schema v6: preferences for suggestions and planning, and pain flags on lifts.
alter table users add column preferences jsonb not null default '{}' check (jsonb_typeof(preferences) = 'object');
grant update (preferences) on users to forkbell_app;

alter table workout_exercises add column pain boolean not null default false;
alter table workout_exercises add column pain_note text check (length(pain_note) <= 300);
