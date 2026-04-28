ALTER TABLE employees ADD COLUMN dept_id integer NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN div_id integer NOT NULL DEFAULT 0;

ALTER TABLE positions ADD COLUMN dept_id integer NOT NULL DEFAULT 0;

ALTER TABLE job_titles ADD COLUMN dept_id integer NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN dept_id integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN div_id integer NOT NULL DEFAULT 0;

ALTER TABLE kra_templates ADD COLUMN dept_id integer NOT NULL DEFAULT 0;

