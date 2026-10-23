-- Schema v7: sleep, mood and medications; custom measurements; per-weekday
-- goals; and family sharing.
--
-- Sharing model
--   * A person (the owner) creates an invite with chosen permissions; another
--     account on this server accepts it with the code. Either side can end it.
--   * Each request still says who is signed in (app.user_id). When viewing
--     someone else's data it also says whose (app.profile_id). Every policy
--     now shows rows of exactly one person, the profile, and only when the
--     signed-in person may see that kind of data. Your own data: always.
--   * Only food logging can be done for someone else (food_write). Training,
--     progress and wellbeing are read-only for others.

create or replace function app_profile_id() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('app.profile_id', true), '')::uuid, app_user_id())
$$;

create table shares (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references users(id) on delete cascade,
  grantee_id  uuid not null references users(id) on delete cascade,
  permissions text[] not null check (permissions <@ array['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read']::text[] and cardinality(permissions) > 0),
  created_at  timestamptz not null default now(),
  unique (owner_id, grantee_id),
  check (owner_id <> grantee_id)
);
-- Not FORCEd (like users and sessions): the SECURITY DEFINER functions below
-- run as the table owner and must see every row; the app role is still bound
-- by the policies.
alter table shares enable row level security;
create policy shares_see on shares for select using (owner_id = app_user_id() or grantee_id = app_user_id());
create policy shares_change on shares for update using (owner_id = app_user_id()) with check (owner_id = app_user_id());
create policy shares_end on shares for delete using (owner_id = app_user_id() or grantee_id = app_user_id());
-- No insert policy: a share only comes into being by accepting an invite.

/** May the signed-in person do this with the current profile's data? Always yes for your own. */
create or replace function may(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select app_profile_id() = app_user_id()
      or exists (select 1 from shares where owner_id = app_profile_id() and grantee_id = app_user_id() and perm = any(permissions))
$$;
create or replace function may_view_profile() returns boolean
language sql stable security definer set search_path = public as $$
  select app_profile_id() = app_user_id()
      or exists (select 1 from shares where owner_id = app_profile_id() and grantee_id = app_user_id())
$$;
create or replace function is_self() returns boolean language sql stable as $$ select app_profile_id() = app_user_id() $$;

create table share_invites (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default app_user_id() references users(id) on delete cascade,
  code_hash   text not null unique,
  permissions text[] not null check (permissions <@ array['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read']::text[] and cardinality(permissions) > 0),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
alter table share_invites enable row level security;
create policy invites_own on share_invites for all using (owner_id = app_user_id()) with check (owner_id = app_user_id());

/** Accept an invite by its code (hashed by the server). Returns the new share's id. */
create or replace function accept_share_invite(p_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv share_invites; sid uuid;
begin
  if app_user_id() is null then raise exception 'not signed in'; end if;
  select * into inv from share_invites where code_hash = p_hash and used_at is null and expires_at > now() for update;
  if not found then raise exception 'invite not found or expired' using errcode = 'no_data_found'; end if;
  if inv.owner_id = app_user_id() then raise exception 'that is your own invite' using errcode = 'check_violation'; end if;
  insert into shares (owner_id, grantee_id, permissions) values (inv.owner_id, app_user_id(), inv.permissions)
    on conflict (owner_id, grantee_id) do update set permissions = excluded.permissions
    returning id into sid;
  update share_invites set used_at = now() where id = inv.id;
  return sid;
end $$;

/** The people on both sides of your shares, with names (other users' rows are otherwise invisible). */
create or replace function share_list()
returns table (share_id uuid, direction text, person_id uuid, person_name text, person_email text, permissions text[])
language sql stable security definer set search_path = public as $$
  select s.id, 'mine', u.id, u.name, u.email, s.permissions from shares s join users u on u.id = s.grantee_id where s.owner_id = app_user_id()
  union all
  select s.id, 'with_me', u.id, u.name, u.email, s.permissions from shares s join users u on u.id = s.owner_id where s.grantee_id = app_user_id()
$$;

revoke all on function accept_share_invite(text), share_list(), may(text), may_view_profile() from public;
grant execute on function accept_share_invite(text), share_list(), may(text), may_view_profile(), is_self(), app_profile_id() to forkbell_app;
grant select, update, delete on shares to forkbell_app;
grant select, insert, delete on share_invites to forkbell_app;

-- Rewrite every policy around the profile -------------------------------------
drop policy users_self_read on users;
create policy users_read on users for select using (id = app_user_id() or (id = app_profile_id() and may_view_profile()));

drop policy diary_own on diary_entries;
alter table diary_entries alter column user_id set default app_profile_id();
create policy diary_read on diary_entries for select using (user_id = app_profile_id() and may('food_read'));
create policy diary_add on diary_entries for insert with check (user_id = app_profile_id() and may('food_write'));
create policy diary_change on diary_entries for update using (user_id = app_profile_id() and may('food_write')) with check (user_id = app_profile_id() and may('food_write'));
create policy diary_remove on diary_entries for delete using (user_id = app_profile_id() and may('food_write'));

drop policy foods_read on foods;
drop policy foods_insert on foods;
drop policy foods_update on foods;
drop policy foods_delete on foods;
create policy foods_read on foods for select using (owner_id is null or (owner_id = app_profile_id() and may('food_read')));
create policy foods_insert on foods for insert with check (owner_id = app_profile_id() and may('food_write'));
create policy foods_update on foods for update using (owner_id = app_profile_id() and may('food_write')) with check (owner_id = app_profile_id() and may('food_write'));
create policy foods_delete on foods for delete using (owner_id = app_profile_id() and may('food_write'));

drop policy exercises_read on exercises;
drop policy exercises_insert on exercises;
drop policy exercises_update on exercises;
drop policy exercises_delete on exercises;
create policy exercises_read on exercises for select using (owner_id is null or (owner_id = app_profile_id() and may('training_read')));
create policy exercises_write on exercises for insert with check (owner_id = app_user_id() and is_self());
create policy exercises_update on exercises for update using (owner_id = app_user_id() and is_self()) with check (owner_id = app_user_id() and is_self());
create policy exercises_delete on exercises for delete using (owner_id = app_user_id() and is_self());

-- Read-only for others: training, progress, wellbeing.
do $$
declare t text; perm text;
begin
  for t, perm in values
    ('programs', 'training_read'), ('routines', 'training_read'), ('routine_exercises', 'training_read'),
    ('workouts', 'training_read'), ('workout_exercises', 'training_read'), ('workout_sets', 'training_read'),
    ('weigh_ins', 'progress_read'), ('measurements', 'progress_read'), ('health_daily', 'progress_read')
  loop
    execute format('drop policy %I on %I', t || '_own', t);
    execute format('create policy %I on %I for select using (user_id = app_profile_id() and may(%L))', t || '_read', t, perm);
    execute format('create policy %I on %I for insert with check (user_id = app_user_id() and is_self())', t || '_add', t);
    execute format('create policy %I on %I for update using (user_id = app_user_id() and is_self()) with check (user_id = app_user_id() and is_self())', t || '_change', t);
    execute format('create policy %I on %I for delete using (user_id = app_user_id() and is_self())', t || '_remove', t);
  end loop;
end $$;

-- Sleep, mood and medications ---------------------------------------------------
create table check_ins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default app_user_id() references users(id) on delete cascade,
  date        date not null,
  sleep_hours numeric(4,2) check (sleep_hours between 0 and 24),
  sleep_quality integer check (sleep_quality between 1 and 5),
  mood        integer check (mood between 1 and 5),
  energy      integer check (energy between 1 and 5),
  note        text check (length(note) <= 1000),
  unique (user_id, date)
);

create table medications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default app_user_id() references users(id) on delete cascade,
  name        text not null check (length(name) between 1 and 120),
  dose        text check (length(dose) <= 60),
  times_per_day integer not null default 1 check (times_per_day between 1 and 6),
  notes       text check (length(notes) <= 500),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table medication_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default app_user_id() references users(id) on delete cascade,
  medication_id uuid not null,
  date          date not null,
  slot          integer not null check (slot between 0 and 5),
  status        text not null check (status in ('taken', 'skipped')),
  at            timestamptz not null default now(),
  unique (medication_id, date, slot),
  foreign key (medication_id, user_id) references medications(id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['check_ins', 'medications', 'medication_logs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I for select using (user_id = app_profile_id() and may(%L))', t || '_read', t, 'wellbeing_read');
    execute format('create policy %I on %I for insert with check (user_id = app_user_id() and is_self())', t || '_add', t);
    execute format('create policy %I on %I for update using (user_id = app_user_id() and is_self()) with check (user_id = app_user_id() and is_self())', t || '_change', t);
    execute format('create policy %I on %I for delete using (user_id = app_user_id() and is_self())', t || '_remove', t);
    execute format('grant select, insert, update, delete on %I to forkbell_app', t);
  end loop;
end $$;

-- Custom measurements: any name and unit, not just body tape measurements -----
alter table measurements drop constraint measurements_kind_check;
alter table measurements add constraint measurements_kind_check check (length(kind) between 1 and 40);
alter table measurements rename column value_cm to value;
alter table measurements alter column value type numeric(10,2);
alter table measurements drop constraint measurements_value_cm_check;
alter table measurements add constraint measurements_value_check check (value between 0 and 100000);
alter table measurements add column unit text not null default 'cm' check (length(unit) between 1 and 12);

-- Per-weekday goals: {"0": {"kcal": ..., ...}} for Sunday, and so on ----------
alter table users add column weekday_goals jsonb not null default '{}' check (jsonb_typeof(weekday_goals) = 'object');
grant update (weekday_goals) on users to forkbell_app;
