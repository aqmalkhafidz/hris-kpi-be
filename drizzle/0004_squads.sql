CREATE TABLE IF NOT EXISTS "squads" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL DEFAULT '',
  "name" text NOT NULL,
  "division" text NOT NULL DEFAULT '',
  "div_id" integer NOT NULL DEFAULT 0,
  "department" text NOT NULL DEFAULT '',
  "dept_id" integer NOT NULL DEFAULT 0,
  "description" text NOT NULL DEFAULT ''
);

ALTER TABLE "divisions" ADD COLUMN IF NOT EXISTS "code" text NOT NULL DEFAULT '';

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "org_role" text NOT NULL DEFAULT 'staff';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "reviewer_sl" text DEFAULT NULL;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "reviewer_hod" text DEFAULT NULL;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "reviewer_hodiv" text DEFAULT NULL;
