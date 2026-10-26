-- Schema v16: water.
--
-- Each glass or bottle is its own row, so the last one can be taken back and
-- the day's total is just the sum. The app makes the id, so a drink logged
-- offline and sent twice on a bad connection is only counted once.

create table water_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default app_user_id() references users(id) on delete cascade,
  date       date not null,
  ml         integer not null check (ml between 1 and 5000),
  created_at timestamptz not null default now()
);
create index water_entries_user_date_idx on water_entries(user_id, date);

-- Like check-ins: yours to change, and seen by people you share wellbeing with.
alter table water_entries enable row level security;
alter table water_entries force row level security;
create policy water_entries_read on water_entries for select using (user_id = app_profile_id() and may('wellbeing_read'));
create policy water_entries_add on water_entries for insert with check (user_id = app_user_id() and is_self());
create policy water_entries_change on water_entries for update using (user_id = app_user_id() and is_self()) with check (user_id = app_user_id() and is_self());
create policy water_entries_remove on water_entries for delete using (user_id = app_user_id() and is_self());
grant select, insert, update, delete on water_entries to forkbell_app;
