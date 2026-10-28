-- Schema v26: two more meal slots (meal5, meal6), off until you turn them on.
-- Every slot can be renamed in your preferences; the keys stay the same, so
-- renaming never moves what you logged.
alter table diary_entries drop constraint if exists diary_entries_meal_check;
alter table diary_entries add constraint diary_entries_meal_check check (meal in ('breakfast', 'lunch', 'dinner', 'snacks', 'meal5', 'meal6'));
