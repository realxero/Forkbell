-- Schema v22: sessions started with a one-time code from a device that's
-- already signed in. The codes themselves live only in the server's memory
-- for five minutes; this is just the label on the session.
alter table sessions drop constraint if exists sessions_method_check;
alter table sessions add constraint sessions_method_check check (method in ('sso', 'password', 'code'));
