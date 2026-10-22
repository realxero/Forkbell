-- Forkbell schema v1: users, sign-in sessions, foods, diary.
--
-- Security model
--   * Migrations run as the database admin. The server runs as forkbell_app,
--     which has NOBYPASSRLS, so Postgres itself filters every row by user.
--   * The server sets app.user_id at the start of each request's transaction;
--     app_user_id() reads it. No user set = no rows.
--   * forkbell_app cannot read the users' sign-in data or the sessions table at
--     all. It goes through a few SECURITY DEFINER functions instead.

create extension if not exists pgcrypto;

create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- Users ---------------------------------------------------------------------
create table users (
  id           uuid primary key default gen_random_uuid(),
  oidc_issuer  text not null,
  oidc_subject text not null,
  email        text,
  name         text,
  goal_kcal    integer,
  goal_protein numeric(6,1),
  goal_carbs   numeric(6,1),
  goal_fat     numeric(6,1),
  created_at   timestamptz not null default now(),
  unique (oidc_issuer, oidc_subject)
);

alter table users enable row level security;
create policy users_self_read on users for select using (id = app_user_id());
create policy users_self_update on users for update using (id = app_user_id()) with check (id = app_user_id());

-- Sessions (never visible to the app role) -----------------------------------
create table sessions (
  token_hash  text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id);
alter table sessions enable row level security;
-- No policies and no grants: the app role can't see a single row. Only the
-- SECURITY DEFINER functions below touch it; they run as the table owner (the
-- admin), and owners are exempt from RLS because these two tables don't FORCE it.

create or replace function auth_upsert_user(p_issuer text, p_subject text, p_email text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  insert into users (oidc_issuer, oidc_subject, email, name)
  values (p_issuer, p_subject, p_email, p_name)
  on conflict (oidc_issuer, oidc_subject)
  do update set email = excluded.email, name = coalesce(excluded.name, users.name)
  returning id into uid;
  return uid;
end $$;

create or replace function auth_create_session(p_user uuid, p_hash text, p_expires timestamptz)
returns void language sql security definer set search_path = public as $$
  delete from sessions where expires_at < now();
  insert into sessions (token_hash, user_id, expires_at) values (p_hash, p_user, p_expires);
$$;

create or replace function auth_session_user(p_hash text)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from sessions where token_hash = p_hash and expires_at > now()
$$;

create or replace function auth_end_session(p_hash text)
returns void language sql security definer set search_path = public as $$
  delete from sessions where token_hash = p_hash;
$$;

-- Foods -----------------------------------------------------------------------
-- owner_id null = built-in food everyone can read; nobody can change it.
create table foods (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references users(id) on delete cascade,
  name          text not null,
  brand         text,
  source        text not null check (source in ('custom', 'off', 'usda')),
  source_id     text,
  kcal          numeric(6,1) not null check (kcal between 0 and 900),
  protein       numeric(5,1) not null check (protein between 0 and 100),
  carbs         numeric(5,1) not null check (carbs between 0 and 100),
  fat           numeric(5,1) not null check (fat between 0 and 100),
  fiber         numeric(5,1),
  sugar         numeric(5,1),
  sodium_mg     numeric(8,1),
  serving_grams numeric(7,1),
  serving_label text,
  created_at    timestamptz not null default now()
);
create index foods_owner_idx on foods(owner_id);
-- one saved copy per outside product per user
create unique index foods_owner_source_idx on foods(owner_id, source, source_id) where source_id is not null;

alter table foods enable row level security;
alter table foods force row level security;
create policy foods_read on foods for select using (owner_id is null or owner_id = app_user_id());
create policy foods_insert on foods for insert with check (owner_id = app_user_id());
create policy foods_update on foods for update using (owner_id = app_user_id()) with check (owner_id = app_user_id());
create policy foods_delete on foods for delete using (owner_id = app_user_id());

-- Diary -----------------------------------------------------------------------
create table diary_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  date       date not null,
  meal       text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snacks')),
  food_id    uuid not null references foods(id) on delete restrict,
  grams      numeric(7,1) not null check (grams > 0),
  created_at timestamptz not null default now()
);
create index diary_user_date_idx on diary_entries(user_id, date);

alter table diary_entries enable row level security;
alter table diary_entries force row level security;
create policy diary_own on diary_entries for all
  using (user_id = app_user_id()) with check (user_id = app_user_id());

-- Grants for the app role -------------------------------------------------------
grant usage on schema public to forkbell_app;
grant select, update (name, goal_kcal, goal_protein, goal_carbs, goal_fat) on users to forkbell_app;
grant select, insert, update, delete on foods, diary_entries to forkbell_app;
grant execute on function app_user_id() to forkbell_app;
revoke all on function auth_upsert_user(text, text, text, text), auth_create_session(uuid, text, timestamptz),
  auth_session_user(text), auth_end_session(text) from public;
grant execute on function auth_upsert_user(text, text, text, text), auth_create_session(uuid, text, timestamptz),
  auth_session_user(text), auth_end_session(text) to forkbell_app;
