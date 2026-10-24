-- Schema v13: a reminder time for each dose of a medication.
--
-- Local wall-clock times ("HH:MM"), one per dose, in dose order; an empty
-- string is a dose with no reminder. The phone schedules the notifications
-- itself, so nothing here ever sends anything.
alter table medications
  add column reminder_times text[] not null default '{}'
    check (cardinality(reminder_times) <= 6);
