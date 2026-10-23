-- Schema v9: saved meals and recipes.
--
--   saved_meals / saved_meal_items  a named group of foods and amounts you log
--                                   together ("my usual breakfast")
--   recipes / recipe_items          a dish made from ingredients; the dish
--                                   itself is a food (source 'recipe') so it
--                                   logs, searches and syncs like any other
--
-- Sharing follows the diary: food_read to see them, food_write to change them.

alter table foods drop constraint foods_source_check;
alter table foods add constraint foods_source_check check (source in ('custom', 'off', 'usda', 'builtin', 'recipe'));

create table saved_meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_profile_id() references users(id) on delete cascade,
  name       text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table saved_meal_items (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default app_profile_id() references users(id) on delete cascade,
  meal_id  uuid not null,
  food_id  uuid not null references foods(id) on delete cascade,
  grams    numeric(7,1) not null check (grams > 0 and grams <= 10000),
  position integer not null default 0,
  foreign key (meal_id, user_id) references saved_meals(id, user_id) on delete cascade
);

create table recipes (
  food_id      uuid primary key references foods(id) on delete cascade,
  user_id      uuid not null default app_profile_id() references users(id) on delete cascade,
  servings     numeric(5,1) not null check (servings > 0 and servings <= 100),
  -- weight of the finished dish when it was weighed after cooking; else the ingredients' total
  cooked_grams numeric(8,1) check (cooked_grams > 0 and cooked_grams <= 50000),
  unique (food_id, user_id)
);

create table recipe_items (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default app_profile_id() references users(id) on delete cascade,
  recipe_id uuid not null,
  food_id   uuid not null references foods(id) on delete cascade,
  grams     numeric(7,1) not null check (grams > 0 and grams <= 10000),
  position  integer not null default 0,
  foreign key (recipe_id, user_id) references recipes(food_id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['saved_meals', 'saved_meal_items', 'recipes', 'recipe_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I for select using (user_id = app_profile_id() and may(%L))', t || '_read', t, 'food_read');
    execute format('create policy %I on %I for insert with check (user_id = app_profile_id() and may(%L))', t || '_add', t, 'food_write');
    execute format('create policy %I on %I for update using (user_id = app_profile_id() and may(%L)) with check (user_id = app_profile_id() and may(%L))', t || '_change', t, 'food_write', 'food_write');
    execute format('create policy %I on %I for delete using (user_id = app_profile_id() and may(%L))', t || '_remove', t, 'food_write');
    execute format('grant select, insert, update, delete on %I to forkbell_app', t);
  end loop;
end $$;
