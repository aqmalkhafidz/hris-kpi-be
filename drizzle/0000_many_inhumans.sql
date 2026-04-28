CREATE TABLE IF NOT EXISTS "appraisals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"cycle_name" text NOT NULL,
	"cycle_short" text NOT NULL,
	"status" text NOT NULL,
	"reflection" text NOT NULL,
	"reviewer_sl_user_id" integer NOT NULL,
	"reviewer_sl_name" text NOT NULL,
	"reviewer_sl_initials" text NOT NULL,
	"reviewer_hod_user_id" integer NOT NULL,
	"reviewer_hod_name" text NOT NULL,
	"reviewer_hod_initials" text NOT NULL,
	"reviewer_hodiv_user_id" integer NOT NULL,
	"reviewer_hodiv_name" text NOT NULL,
	"reviewer_hodiv_initials" text NOT NULL,
	"submitted_at" text,
	"acknowledged_at" text,
	"calibrated_score" numeric(4, 2),
	"final_grade" text,
	"calibrated_at" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" integer NOT NULL,
	"timestamp" text NOT NULL,
	"actor_user_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"kra_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"self_deadline" text,
	"status" text NOT NULL,
	"description" text NOT NULL,
	"distributed_at" text,
	"total_appraisals" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"in_review" integer DEFAULT 0 NOT NULL,
	"draft" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"division" text NOT NULL,
	"div_id" integer NOT NULL,
	"head_id" integer NOT NULL,
	"hod" text NOT NULL,
	"positions" integer DEFAULT 0 NOT NULL,
	"headcount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "divisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"head" text NOT NULL,
	"head_id" integer NOT NULL,
	"headcount" integer DEFAULT 0 NOT NULL,
	"departments" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"email" text NOT NULL,
	"nip" text NOT NULL,
	"position" text NOT NULL,
	"dept" text NOT NULL,
	"dept_id" integer DEFAULT 0 NOT NULL,
	"div" text NOT NULL,
	"div_id" integer DEFAULT 0 NOT NULL,
	"division" text NOT NULL,
	"manager" text NOT NULL,
	"squad" text,
	"grade" text NOT NULL,
	"status" text NOT NULL,
	"joined" text NOT NULL,
	"org_role" text DEFAULT 'staff' NOT NULL,
	"reviewer_sl" text,
	"reviewer_hod" text,
	"reviewer_hodiv" text,
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"kra_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"date" text NOT NULL,
	"description" text,
	"url" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"department" text NOT NULL,
	"dept_id" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"headcount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kra_template_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"weight" integer NOT NULL,
	"kpi" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kra_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"dept" text NOT NULL,
	"level" text NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"updated" text NOT NULL,
	"used_by" integer DEFAULT 0 NOT NULL,
	"summary" text NOT NULL,
	CONSTRAINT "kra_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kras" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"target" text NOT NULL,
	"weight" integer NOT NULL,
	"self_score" integer NOT NULL,
	"self_comment" text NOT NULL,
	"sl_score" integer,
	"sl_comment" text,
	"hod_score" integer,
	"hod_comment" text,
	"hodiv_score" integer,
	"hodiv_comment" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"level" text NOT NULL,
	"dept" text NOT NULL,
	"dept_id" integer DEFAULT 0 NOT NULL,
	"template" text NOT NULL,
	"headcount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "squads" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"division" text DEFAULT '' NOT NULL,
	"div_id" integer DEFAULT 0 NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"dept_id" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"role" text NOT NULL,
	"dept" text NOT NULL,
	"dept_id" integer DEFAULT 0 NOT NULL,
	"div" text,
	"div_id" integer DEFAULT 0 NOT NULL,
	"squad" text,
	"position" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_appraisal_id_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."appraisals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_kra_id_kras_id_fk" FOREIGN KEY ("kra_id") REFERENCES "public"."kras"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kra_template_items" ADD CONSTRAINT "kra_template_items_template_id_kra_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."kra_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kras" ADD CONSTRAINT "kras_appraisal_id_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."appraisals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
