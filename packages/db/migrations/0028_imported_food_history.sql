-- Schema v28: food history imported from another app (MyFitnessPal, Lose It,
-- Cronometer...). Each imported line is its own food (source 'import') with
-- that line's numbers, logged as 100 g, so the day adds up exactly. They're
-- kept out of search, your food list and recent foods, so years of history
-- don't crowd what you pick from today.
alter table foods drop constraint foods_source_check;
alter table foods add constraint foods_source_check check (source in ('custom', 'off', 'usda', 'builtin', 'recipe', 'import'));
