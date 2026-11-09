-- Schema v34: tighter coaching limits (from a security review).
--
-- * A coach changes the days and exercises only of programs they made; your
--   own programs' days are yours alone (deleting one of your days would also
--   unlink your past workouts from it).
-- * A coach can't delete a program you're running.
-- * Who made a program can only be cleared by the database itself, when that
--   account is deleted, never by hand (that would hide "From your coach").
-- * Meal plans and suggestions are stamped on insert only, so deleting an
--   account can clear its name from them.

/** May the signed-in person change this program's days? Yours: yes. A coach's: only programs they made. */
create or replace function may_plan_program(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_self() or exists (
    select 1 from programs
    where id = pid and user_id = app_profile_id() and created_by = app_user_id()
  ) and may('plan_write')
$$;
create or replace function may_plan_routine(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select may_plan_program(program_id) from routines where id = rid), false)
$$;

drop policy routines_add on routines;
drop policy routines_change on routines;
drop policy routines_remove on routines;
create policy routines_add on routines for insert with check (user_id = app_profile_id() and may('plan_write') and may_plan_program(program_id));
create policy routines_change on routines for update
  using (user_id = app_profile_id() and may('plan_write') and may_plan_program(program_id))
  with check (user_id = app_profile_id() and may('plan_write') and may_plan_program(program_id));
create policy routines_remove on routines for delete using (user_id = app_profile_id() and may('plan_write') and may_plan_program(program_id));

drop policy routine_exercises_add on routine_exercises;
drop policy routine_exercises_change on routine_exercises;
drop policy routine_exercises_remove on routine_exercises;
create policy routine_exercises_add on routine_exercises for insert with check (user_id = app_profile_id() and may('plan_write') and may_plan_routine(routine_id));
create policy routine_exercises_change on routine_exercises for update
  using (user_id = app_profile_id() and may('plan_write') and may_plan_routine(routine_id))
  with check (user_id = app_profile_id() and may('plan_write') and may_plan_routine(routine_id));
create policy routine_exercises_remove on routine_exercises for delete using (user_id = app_profile_id() and may('plan_write') and may_plan_routine(routine_id));

-- Renaming follows the same rule as the days: a coach, only programs they made.
drop policy programs_change on programs;
create policy programs_change on programs for update
  using (user_id = app_profile_id() and may('plan_write') and (is_self() or created_by = app_user_id()))
  with check (user_id = app_profile_id() and may('plan_write') and (is_self() or created_by = app_user_id()));

drop policy programs_remove on programs;
create policy programs_remove on programs for delete
  using (user_id = app_profile_id() and (is_self() or (may('plan_write') and created_by = app_user_id() and not active)));

create or replace function programs_owner_activates() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.created_by := app_user_id(); end if;
  if not is_self() and new.active and (tg_op = 'INSERT' or not old.active) then
    raise exception 'only they can start a program' using errcode = 'insufficient_privilege';
  end if;
  if not is_self() and tg_op = 'UPDATE' and old.active and not new.active then
    raise exception 'only they can stop a program' using errcode = 'insufficient_privilege';
  end if;
  -- Cleared only by the account-deletion cascade (a nested trigger), never by hand.
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by
     and not (new.created_by is null and pg_trigger_depth() > 1) then
    raise exception 'who made a program does not change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- Whoever writes a meal plan cell or a suggestion is its author, except when
-- the account-deletion cascade (a nested trigger) clears the name.
create or replace function stamp_created_by() returns trigger language plpgsql as $$
begin
  if not (tg_op = 'UPDATE' and new.created_by is null and pg_trigger_depth() > 1) then
    new.created_by := app_user_id();
  end if;
  return new;
end $$;
