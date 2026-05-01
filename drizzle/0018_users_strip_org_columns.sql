ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_dept_id_departments_id_fk",
  DROP CONSTRAINT IF EXISTS "users_div_id_divisions_id_fk",
  DROP COLUMN IF EXISTS "initials",
  DROP COLUMN IF EXISTS "role",
  DROP COLUMN IF EXISTS "dept",
  DROP COLUMN IF EXISTS "dept_id",
  DROP COLUMN IF EXISTS "div",
  DROP COLUMN IF EXISTS "div_id",
  DROP COLUMN IF EXISTS "squad",
  DROP COLUMN IF EXISTS "position";
