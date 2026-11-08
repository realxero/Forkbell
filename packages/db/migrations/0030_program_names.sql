-- Schema v30: the starter programs' names are title case now ("Push / Pull /
-- Legs", "Upper / Lower, 4 days"). Programs made from a starter before this
-- keep the name they were given, so rename the ones still called exactly the
-- old name. A name someone typed themselves is never touched.
-- Row-level security would hide every row from a non-superuser admin, so it
-- is lifted for this one statement (as in 0002).
alter table programs no force row level security;
update programs set name = 'Push / Pull / Legs' where name = 'Push / pull / legs';
update programs set name = 'Upper / Lower, 4 days' where name = 'Upper / lower, 4 days';
alter table programs force row level security;
