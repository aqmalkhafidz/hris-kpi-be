ALTER TABLE "positions" ADD COLUMN "div_id" integer;

UPDATE "positions" p
SET "div_id" = d."div_id"
FROM "departments" d
WHERE p."dept_id" = d."id";

ALTER TABLE "positions"
  ALTER COLUMN "div_id" SET NOT NULL,
  ALTER COLUMN "div_id" SET DEFAULT 0,
  ADD CONSTRAINT "positions_div_id_fkey"
    FOREIGN KEY ("div_id") REFERENCES "divisions"("id") ON DELETE RESTRICT;
