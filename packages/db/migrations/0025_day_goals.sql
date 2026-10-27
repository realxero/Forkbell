-- Schema v25: the goals a day was logged against. Kept when you log food on
-- a day, so changing your goals later doesn't recolour past days (Days logged,
-- charts) or change what a past day shows as its goal.
create table day_goals (
  user_id uuid not null default app_user_id() references users(id) on delete cascade,
  date    date not null,
  goals   jsonb not null check (jsonb_typeof(goals) = 'object'),
  primary key (user_id, date)
);
alter table day_goals enable row level security;
alter table day_goals force row level security;
create policy day_goals_read on day_goals for select using (user_id = app_profile_id() and may('food_read'));
create policy day_goals_write on day_goals for insert with check (user_id = app_profile_id() and may('food_write'));
create policy day_goals_change on day_goals for update using (user_id = app_profile_id() and may('food_write')) with check (user_id = app_profile_id() and may('food_write'));
grant select, insert, update on day_goals to forkbell_app;
