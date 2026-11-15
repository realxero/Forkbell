-- Schema v35: blood glucose (a day's average, mg/dL, from a CGM or meter) and
-- period days (1 on a day with flow), both read from Apple Health or Health Connect.
alter table health_daily drop constraint health_daily_kind_check;
alter table health_daily add constraint health_daily_kind_check check (kind in (
  'steps', 'active_kcal', 'resting_kcal', 'resting_hr',
  'exercise_min', 'flights', 'distance_m', 'hr_avg', 'hrv_ms', 'spo2_pct', 'resp_rate', 'vo2max', 'lean_kg', 'sleep_min',
  'glucose', 'period'
));
