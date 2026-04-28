CREATE TABLE IF NOT EXISTS "job_titles" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "level" text NOT NULL,
  "department" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "headcount" integer NOT NULL DEFAULT 0
);
