ALTER TABLE "users" ADD COLUMN "employee_id" integer;

ALTER TABLE "users"
  ADD CONSTRAINT "users_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id")
  ON DELETE SET NULL;

CREATE UNIQUE INDEX "users_employee_id_unique"
  ON "users" ("employee_id")
  WHERE "employee_id" IS NOT NULL;

UPDATE "users" AS u
SET "employee_id" = e."id"
FROM "employees" AS e
WHERE lower(u."email") = lower(e."email");
