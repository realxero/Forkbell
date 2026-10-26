-- Schema v15: password sign-in, and seeing where you're signed in.
--
-- Passwords live in their own table that the app role can't read or write.
-- Like sessions, it's only reached through the SECURITY DEFINER functions
-- below. The server hashes passwords (scrypt) before they get here; the
-- database never sees a plain password.
--
-- A password account is an ordinary user with oidc_issuer 'local'. Someone who
-- signs in with Authelia can also add a password, so either works for them.

create table password_logins (
  user_id       uuid primary key references users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  password_hash text not null,
  created_at    timestamptz not null default now(),
  changed_at    timestamptz not null default now()
);
alter table password_logins enable row level security;
-- No policies and no grants, as for sessions.

-- Where each session came from, so you can see your devices and sign them out.
alter table sessions add column method text check (method in ('sso', 'password'));
alter table sessions add column device text check (length(device) <= 120);

-- Signing in -----------------------------------------------------------------
create or replace function auth_password_lookup(p_username text)
returns table (user_id uuid, password_hash text) language sql stable security definer set search_path = public as $$
  select user_id, password_hash from password_logins where username = lower(p_username)
$$;

create or replace function auth_user_count()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from users
$$;

-- A new password account. Null if the username is taken.
create or replace function auth_password_signup(p_username text, p_hash text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if exists (select 1 from password_logins where username = lower(p_username)) then return null; end if;
  -- Two sign-ups racing for one name: the unique index stops the second.
  -- The subject is random, so a username can change later without clashing.
  insert into users (oidc_issuer, oidc_subject, name) values ('local', gen_random_uuid()::text, p_name)
  returning id into uid;
  insert into password_logins (user_id, username, password_hash) values (uid, lower(p_username), p_hash);
  return uid;
exception when unique_violation then
  return null;
end $$;

create or replace function auth_tag_session(p_hash text, p_method text, p_device text)
returns void language sql security definer set search_path = public as $$
  update sessions set method = p_method, device = left(p_device, 120) where token_hash = p_hash;
$$;

-- Your own sign-in (these use app_user_id(), so only for the signed-in person) --
create or replace function auth_password_info()
returns table (username text, changed_at timestamptz) language sql stable security definer set search_path = public as $$
  select username, changed_at from password_logins where user_id = app_user_id()
$$;

-- Add or change your password (and username). False if the username is someone else's.
create or replace function auth_password_set(p_username text, p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if app_user_id() is null then return false; end if;
  if exists (select 1 from password_logins where username = lower(p_username) and user_id <> app_user_id()) then return false; end if;
  insert into password_logins (user_id, username, password_hash) values (app_user_id(), lower(p_username), p_hash)
  on conflict (user_id) do update set username = excluded.username, password_hash = excluded.password_hash, changed_at = now();
  return true;
end $$;

-- Only for accounts that can still sign in some other way (Authelia).
create or replace function auth_password_remove()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from users where id = app_user_id() and oidc_issuer = 'local') then return false; end if;
  delete from password_logins where user_id = app_user_id();
  return true;
end $$;

create or replace function auth_is_local()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select oidc_issuer = 'local' from users where id = app_user_id()), false)
$$;

-- Your sign-ins, without Shortcut keys (they have their own list). The id is the
-- start of the stored hash: enough to pick one, useless for signing in.
create or replace function auth_list_sessions(p_current text)
returns table (id text, method text, device text, created_at timestamptz, expires_at timestamptz, current boolean)
language sql stable security definer set search_path = public as $$
  select left(s.token_hash, 16), s.method, s.device, s.created_at, s.expires_at, s.token_hash = p_current
  from sessions s
  where s.user_id = app_user_id() and s.expires_at > now()
    and not exists (select 1 from shortcut_keys k where k.token_hash = s.token_hash)
  order by s.created_at desc
$$;

create or replace function auth_end_session_by_id(p_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if length(p_id) <> 16 then return false; end if;
  delete from sessions s where s.user_id = app_user_id() and left(s.token_hash, 16) = p_id
    and not exists (select 1 from shortcut_keys k where k.token_hash = s.token_hash);
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Sign out everywhere else (Shortcut keys keep working; remove them separately).
create or replace function auth_end_other_sessions(p_keep text)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from sessions s where s.user_id = app_user_id() and s.token_hash <> p_keep
    and not exists (select 1 from shortcut_keys k where k.token_hash = s.token_hash);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function auth_password_lookup(text), auth_user_count(), auth_password_signup(text, text, text),
  auth_tag_session(text, text, text), auth_password_info(), auth_password_set(text, text), auth_password_remove(),
  auth_is_local(), auth_list_sessions(text), auth_end_session_by_id(text), auth_end_other_sessions(text) from public;
grant execute on function auth_password_lookup(text), auth_user_count(), auth_password_signup(text, text, text),
  auth_tag_session(text, text, text), auth_password_info(), auth_password_set(text, text), auth_password_remove(),
  auth_is_local(), auth_list_sessions(text), auth_end_session_by_id(text), auth_end_other_sessions(text) to forkbell_app;
