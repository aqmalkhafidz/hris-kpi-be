ALTER TABLE "employees"
  DROP COLUMN IF EXISTS "reviewer_sl",
  DROP COLUMN IF EXISTS "reviewer_hod",
  DROP COLUMN IF EXISTS "reviewer_hodiv",
  ADD COLUMN "reviewer_sl_id" integer REFERENCES "employees"("id") ON DELETE SET NULL,
  ADD COLUMN "reviewer_hod_id" integer REFERENCES "employees"("id") ON DELETE SET NULL,
  ADD COLUMN "reviewer_hodiv_id" integer REFERENCES "employees"("id") ON DELETE SET NULL;
