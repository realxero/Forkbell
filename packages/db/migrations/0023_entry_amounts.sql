-- Schema v23: entries remember how you said the amount ("1 bar", "11 fl oz",
-- "4 oz") alongside the grams the numbers come from, and can have their own
-- name ("Grandma's lasagna") without renaming the food everywhere.
alter table diary_entries
  add column amount numeric(10,3) check (amount > 0 and amount <= 100000),
  add column unit text check (length(unit) between 1 and 64),
  add column name text check (length(name) between 1 and 120);
