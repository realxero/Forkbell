-- Schema v24: vitamins and minerals per 100 g (mg or µg, see MICROS in the
-- shared package), from labels, Open Food Facts and USDA when they list them.
alter table foods add column micros jsonb check (micros is null or jsonb_typeof(micros) = 'object');
