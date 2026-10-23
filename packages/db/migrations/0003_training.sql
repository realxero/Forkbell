-- Schema v3: training.
--   exercises          built-in (no owner) and your own, like foods
--   programs           a named rotation of routines; at most one active
--   routines           one training day: exercises with sets, rep range, rest
--   workouts           a session you logged (unfinished while finished_at is null)
--   workout_exercises  the exercises in a session, in order, with their targets
--   workout_sets       the sets, with weight in kg, reps or seconds, RPE
--
-- Every user table follows the same rules as the diary: user_id defaults to
-- the signed-in user and the policy only lets you see and write your own rows.
-- Child rows point at their parent with (id, user_id), so a row can never be
-- attached to someone else's workout or routine even by a guessed id.

alter table users add column weight_unit text not null default 'lb' check (weight_unit in ('lb', 'kg'));
grant update (weight_unit) on users to forkbell_app;

-- Exercises ----------------------------------------------------------------
create table exercises (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references users(id) on delete cascade,
  source       text not null check (source in ('builtin', 'custom')),
  key          text,
  name         text not null check (length(name) between 1 and 120),
  muscle       text not null,
  equipment    text not null,
  -- weight: weight x reps; bodyweight: reps, optional added weight; time: seconds
  kind         text not null check (kind in ('weight', 'bodyweight', 'time')),
  -- small: 5 lb / 2.5 kg steps; large: 10 lb / 5 kg (big lower-body lifts)
  increment    text not null default 'small' check (increment in ('small', 'large')),
  rest_seconds integer not null default 120 check (rest_seconds between 0 and 900),
  created_at   timestamptz not null default now(),
  check ((source = 'builtin') = (owner_id is null))
);
create unique index exercises_builtin_key_idx on exercises(key) where source = 'builtin';
create index exercises_owner_idx on exercises(owner_id);

alter table exercises enable row level security;
alter table exercises force row level security;
create policy exercises_read on exercises for select using (owner_id is null or owner_id = app_user_id());
create policy exercises_insert on exercises for insert with check (owner_id = app_user_id());
create policy exercises_update on exercises for update using (owner_id = app_user_id()) with check (owner_id = app_user_id());
create policy exercises_delete on exercises for delete using (owner_id = app_user_id());

-- A row may only point at an exercise the signed-in user can see (built-in or
-- their own). Runs as the caller, so row-level security decides.
create or replace function check_exercise_visible() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from exercises where id = new.exercise_id) then
    raise exception 'exercise not found' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

-- Programs and routines ------------------------------------------------------
create table programs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  name       text not null check (length(name) between 1 and 120),
  active     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index programs_one_active_idx on programs(user_id) where active;

create table routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  program_id uuid not null,
  name       text not null check (length(name) between 1 and 120),
  position   integer not null,
  unique (id, user_id),
  foreign key (program_id, user_id) references programs(id, user_id) on delete cascade
);
create index routines_program_idx on routines(program_id, position);

create table routine_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default app_user_id() references users(id) on delete cascade,
  routine_id   uuid not null,
  exercise_id  uuid not null references exercises(id),
  position     integer not null,
  sets         integer not null check (sets between 1 and 20),
  rep_min      integer not null check (rep_min between 1 and 100),
  rep_max      integer not null check (rep_max between 1 and 100),
  rest_seconds integer not null check (rest_seconds between 0 and 900),
  check (rep_max >= rep_min),
  foreign key (routine_id, user_id) references routines(id, user_id) on delete cascade
);
create index routine_exercises_routine_idx on routine_exercises(routine_id, position);
create trigger routine_exercises_exercise_visible before insert or update of exercise_id on routine_exercises
  for each row execute function check_exercise_visible();

-- Workouts ---------------------------------------------------------------------
create table workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default app_user_id() references users(id) on delete cascade,
  date        date not null,
  name        text not null check (length(name) between 1 and 120),
  routine_id  uuid,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  notes       text check (length(notes) <= 2000),
  unique (id, user_id),
  -- deleting a routine keeps its past workouts, just unlinked
  foreign key (routine_id, user_id) references routines(id, user_id) on delete set null (routine_id)
);
create index workouts_user_date_idx on workouts(user_id, date desc);
create unique index workouts_one_open_idx on workouts(user_id) where finished_at is null;

create table workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default app_user_id() references users(id) on delete cascade,
  workout_id   uuid not null,
  exercise_id  uuid not null references exercises(id),
  position     integer not null,
  rest_seconds integer not null check (rest_seconds between 0 and 900),
  target_sets  integer check (target_sets between 1 and 20),
  rep_min      integer check (rep_min between 1 and 100),
  rep_max      integer check (rep_max between 1 and 100),
  unique (id, user_id),
  foreign key (workout_id, user_id) references workouts(id, user_id) on delete cascade
);
create index workout_exercises_workout_idx on workout_exercises(workout_id, position);
create index workout_exercises_exercise_idx on workout_exercises(user_id, exercise_id);
create trigger workout_exercises_exercise_visible before insert or update of exercise_id on workout_exercises
  for each row execute function check_exercise_visible();

create table workout_sets (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default app_user_id() references users(id) on delete cascade,
  workout_exercise_id uuid not null,
  position            integer not null,
  weight_kg           numeric(7,3) check (weight_kg between 0 and 1000),
  reps                integer check (reps between 0 and 1000),
  seconds             integer check (seconds between 0 and 86400),
  rpe                 numeric(3,1) check (rpe between 1 and 10),
  warmup              boolean not null default false,
  done                boolean not null default false,
  foreign key (workout_exercise_id, user_id) references workout_exercises(id, user_id) on delete cascade
);
create index workout_sets_exercise_idx on workout_sets(workout_exercise_id, position);

-- Row-level security for every user table above.
do $$
declare t text;
begin
  foreach t in array array['programs', 'routines', 'routine_exercises', 'workouts', 'workout_exercises', 'workout_sets'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I for all using (user_id = app_user_id()) with check (user_id = app_user_id())', t || '_own', t);
    execute format('grant select, insert, update, delete on %I to forkbell_app', t);
  end loop;
end $$;
grant select, insert, update, delete on exercises to forkbell_app;
