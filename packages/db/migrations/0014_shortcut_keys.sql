-- Schema v14: Shortcut keys, for Siri and the Shortcuts app.
--
-- A key is a long-lived sign-in session (in `sessions`, like any other) that
-- the server only accepts on /api/shortcuts/*: asking Bell, adding what Bell
-- suggested after you confirm, and what's left today. This table lists your
-- keys so you can see and remove them; it holds only the session's hash,
-- which can't be used to sign in.
create table shortcut_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default app_user_id() references users(id) on delete cascade,
  label        text not null check (length(label) between 1 and 60),
  token_hash   text not null unique,
  hint         text not null check (length(hint) <= 12),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index shortcut_keys_user_idx on shortcut_keys(user_id);
alter table shortcut_keys enable row level security;
alter table shortcut_keys force row level security;
create policy shortcut_keys_own on shortcut_keys for all
  using (user_id = app_user_id() and is_self())
  with check (user_id = app_user_id() and is_self());
grant select, insert, update, delete on shortcut_keys to forkbell_app;
