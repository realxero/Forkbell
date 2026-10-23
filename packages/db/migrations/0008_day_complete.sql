-- Schema v8: marking a day's food log as finished ("closed out").
--
-- A row means the day is complete: everything eaten is logged. The daily-burn
-- estimate can then trust that day, and the calendar can tell a finished day
-- from one that's only partly logged. Sharing follows the diary: food_read to
-- see it, food_write to change it.

create table day_status (
  user_id      uuid not null default app_profile_id() references users(id) on delete cascade,
  date         date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table day_status enable row level security;
alter table day_status force row level security;
create policy day_status_read on day_status for select using (user_id = app_profile_id() and may('food_read'));
create policy day_status_add on day_status for insert with check (user_id = app_profile_id() and may('food_write'));
create policy day_status_remove on day_status for delete using (user_id = app_profile_id() and may('food_write'));
grant select, insert, delete on day_status to forkbell_app;
