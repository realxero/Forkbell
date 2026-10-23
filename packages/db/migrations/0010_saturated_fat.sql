-- Schema v10: saturated fat, for the nutrient watch. Filled from Open Food
-- Facts and USDA where they have it; empty (not zero) where nobody said.
alter table foods add column sat_fat numeric(6,2) check (sat_fat >= 0 and sat_fat <= 100);
