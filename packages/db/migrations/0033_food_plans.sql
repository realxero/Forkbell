-- Schema v33: a coach can plan your food.
--
-- A new share permission, food_plan ("Plan my food"), includes seeing your
-- food and lets the person you invite keep a weekly meal plan for you and
-- suggest calorie and macro targets. It never logs to your diary (that is
-- food_write) and never changes your goals: you apply a suggestion yourself.

alter table shares drop constraint shares_permissions_check;
alter table shares add constraint shares_permissions_check
  check (permissions <@ array['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read', 'plan_write', 'food_plan']::text[] and cardinality(permissions) > 0);
alter table share_invites drop constraint share_invites_permissions_check;
alter table share_invites add constraint share_invites_permissions_check
  check (permissions <@ array['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read', 'plan_write', 'food_plan']::text[] and cardinality(permissions) > 0);

-- One plan per weekday (0 = Sunday) and meal: a note, and a saved meal to log in one tap.
create table meal_plan (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default app_profile_id() references users(id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),
  meal          text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snacks', 'meal5', 'meal6')),
  note          text check (length(note) <= 300),
  saved_meal_id uuid,
  created_by    uuid default app_user_id() references users(id) on delete set null,
  unique (user_id, weekday, meal),
  -- only one of your own saved meals; gone with it
  foreign key (saved_meal_id, user_id) references saved_meals(id, user_id) on delete set null (saved_meal_id),
  check (note is not null or saved_meal_id is not null)
);

-- Targets someone coaching you suggests; yours to apply or dismiss.
create table target_suggestions (
  user_id    uuid primary key default app_profile_id() references users(id) on delete cascade,
  kcal       integer not null check (kcal between 800 and 10000),
  protein    numeric(6,1) check (protein between 0 and 1000),
  carbs      numeric(6,1) check (carbs between 0 and 2000),
  fat        numeric(6,1) check (fat between 0 and 1000),
  note       text check (length(note) <= 500),
  created_by uuid default app_user_id() references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Whoever is signed in made it; it can't be written in as someone else.
create or replace function stamp_created_by() returns trigger language plpgsql as $$
begin
  new.created_by := app_user_id();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['meal_plan', 'target_suggestions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I for select using (user_id = app_profile_id() and may(%L))', t || '_read', t, 'food_read');
    execute format('create policy %I on %I for insert with check (user_id = app_profile_id() and may(%L))', t || '_add', t, 'food_plan');
    execute format('create policy %I on %I for update using (user_id = app_profile_id() and may(%L)) with check (user_id = app_profile_id() and may(%L))', t || '_change', t, 'food_plan', 'food_plan');
    execute format('create policy %I on %I for delete using (user_id = app_profile_id() and may(%L))', t || '_remove', t, 'food_plan');
    execute format('grant select, insert, update, delete on %I to forkbell_app', t);
    execute format('create trigger %I before insert or update on %I for each row execute function stamp_created_by()', t || '_stamp', t);
  end loop;
end $$;
