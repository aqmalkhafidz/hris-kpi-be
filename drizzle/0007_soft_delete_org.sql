-- drop stale columns from job_titles (schema.ts already updated)
ALTER TABLE job_titles
  DROP COLUMN IF EXISTS code,
  DROP COLUMN IF EXISTS "level",
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS headcount,
  DROP COLUMN IF EXISTS dept_id;

-- soft-delete column for all org tables
ALTER TABLE divisions   ADD COLUMN deleted_at timestamptz;
ALTER TABLE departments ADD COLUMN deleted_at timestamptz;
ALTER TABLE positions   ADD COLUMN deleted_at timestamptz;
ALTER TABLE employees   ADD COLUMN deleted_at timestamptz;
ALTER TABLE job_titles  ADD COLUMN deleted_at timestamptz;
ALTER TABLE squads      ADD COLUMN deleted_at timestamptz;
