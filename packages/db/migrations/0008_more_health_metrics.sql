-- Schema v8: more from Apple Health and Health Connect: exercise minutes,
-- flights, walking and running distance, average heart rate, HRV, blood
-- oxygen, breathing rate, VO2 max (cardio fitness), lean mass, and sleep.
alter table health_daily drop constraint health_daily_kind_check;
alter table health_daily add constraint health_daily_kind_check check (kind in (
  'steps', 'active_kcal', 'resting_kcal', 'resting_hr',
  'exercise_min', 'flights', 'distance_m', 'hr_avg', 'hrv_ms', 'spo2_pct', 'resp_rate', 'vo2max', 'lean_kg', 'sleep_min'
));
