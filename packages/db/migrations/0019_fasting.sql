-- Schema v19: fasting.
--
-- A fast is a start, a goal in hours, and an end once it's over. One fast at
-- a time. The app can make the id, so a fast started offline is sent once.
create table fasts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default app_user_id() references users(id) on delete cascade,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  target_hours numeric(4,1) not null check (target_hours between 1 and 72),
  check (ended_at is null or ended_at > started_at)
);
create unique index fasts_one_open_idx on fasts(user_id) where ended_at is null;
create index fasts_user_started_idx on fasts(user_id, started_at desc);

-- Like water and check-ins: yours to change, seen by people you share wellbeing with.
alter table fasts enable row level security;
alter table fasts force row level security;
create policy fasts_read on fasts for select using (user_id = app_profile_id() and may('wellbeing_read'));
create policy fasts_add on fasts for insert with check (user_id = app_user_id() and is_self());
create policy fasts_change on fasts for update using (user_id = app_user_id() and is_self()) with check (user_id = app_user_id() and is_self());
create policy fasts_remove on fasts for delete using (user_id = app_user_id() and is_self());
grant select, insert, update, delete on fasts to forkbell_app;
