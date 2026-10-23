-- Schema v4: progress.
--   weigh_ins     one weight per day (a second entry the same day replaces it)
--   measurements  body measurements in cm, one per kind per day
--   users         goal weight, optional goal date, weekly workout goal

alter table users add column goal_weight_kg numeric(6,2) check (goal_weight_kg between 20 and 400);
alter table users add column goal_date date;
alter table users add column weekly_workout_goal integer not null default 3 check (weekly_workout_goal between 1 and 14);
grant update (goal_weight_kg, goal_date, weekly_workout_goal) on users to forkbell_app;

create table weigh_ins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  date       date not null,
  weight_kg  numeric(6,2) not null check (weight_kg between 20 and 400),
  body_fat   numeric(4,1) check (body_fat between 2 and 70),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table measurements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  date       date not null,
  kind       text not null check (kind in ('waist', 'hips', 'chest', 'neck', 'arm', 'thigh', 'calf')),
  value_cm   numeric(5,1) not null check (value_cm between 5 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, date, kind)
);

do $$
declare t text;
begin
  foreach t in array array['weigh_ins', 'measurements'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I for all using (user_id = app_user_id()) with check (user_id = app_user_id())', t || '_own', t);
    execute format('grant select, insert, update, delete on %I to forkbell_app', t);
  end loop;
end $$;
