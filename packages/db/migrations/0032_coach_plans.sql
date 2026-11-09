-- Schema v32: a coach can plan your training.
--
-- A new share permission, plan_write ("Plan my training"), lets the person you
-- share with build and change programs, their days and exercises for you.
-- You stay in control: only you can make a program active, a coach can only
-- delete programs they made, and workouts you log are still only ever yours
-- (workouts and sets keep is_self()). Programs a coach makes are marked with
-- who made them, so the app can say "From your coach".

alter table shares drop constraint shares_permissions_check;
alter table shares add constraint shares_permissions_check
  check (permissions <@ array['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read', 'plan_write']::text[] and cardinality(permissions) > 0);
alter table share_invites drop constraint share_invites_permissions_check;
alter table share_invites add constraint share_invites_permissions_check
  check (permissions <@ array['food_read', 'food_write', 'training_read', 'progress_read', 'wellbeing_read', 'plan_write']::text[] and cardinality(permissions) > 0);

-- Rows a coach adds belong to the person being coached (the profile).
alter table programs alter column user_id set default app_profile_id();
alter table routines alter column user_id set default app_profile_id();
alter table routine_exercises alter column user_id set default app_profile_id();

-- Who made it: you, or your coach. Kept if the coach's account goes.
alter table programs add column created_by uuid default app_user_id() references users(id) on delete set null;
update programs set created_by = user_id;

do $$
declare t text;
begin
  foreach t in array array['programs', 'routines', 'routine_exercises'] loop
    execute format('drop policy %I on %I', t || '_add', t);
    execute format('drop policy %I on %I', t || '_change', t);
    execute format('drop policy %I on %I', t || '_remove', t);
    -- may() is always true for your own data, and for a coach with plan_write.
    execute format('create policy %I on %I for insert with check (user_id = app_profile_id() and may(%L))', t || '_add', t, 'plan_write');
    execute format('create policy %I on %I for update using (user_id = app_profile_id() and may(%L)) with check (user_id = app_profile_id() and may(%L))', t || '_change', t, 'plan_write', 'plan_write');
  end loop;
  execute 'create policy routines_remove on routines for delete using (user_id = app_profile_id() and may(''plan_write''))';
  execute 'create policy routine_exercises_remove on routine_exercises for delete using (user_id = app_profile_id() and may(''plan_write''))';
end $$;
-- A coach removes only programs they made; you can remove any of yours.
create policy programs_remove on programs for delete
  using (user_id = app_profile_id() and (is_self() or (may('plan_write') and created_by = app_user_id())));

-- Only you decide which program you're running.
create or replace function programs_owner_activates() returns trigger language plpgsql as $$
begin
  -- Whoever is signed in made it; it can't be written in as someone else.
  if tg_op = 'INSERT' then new.created_by := app_user_id(); end if;
  if not is_self() and new.active and (tg_op = 'INSERT' or not old.active) then
    raise exception 'only they can start a program' using errcode = 'insufficient_privilege';
  end if;
  if not is_self() and tg_op = 'UPDATE' and old.active and not new.active then
    raise exception 'only they can stop a program' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by and new.created_by is not null then
    raise exception 'who made a program does not change' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger programs_owner_activates before insert or update on programs
  for each row execute function programs_owner_activates();
