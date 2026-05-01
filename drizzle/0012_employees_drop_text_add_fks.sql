-- Drop redundant text columns from employees
ALTER TABLE employees DROP COLUMN IF EXISTS position;
ALTER TABLE employees DROP COLUMN IF EXISTS dept;
ALTER TABLE employees DROP COLUMN IF EXISTS div;
ALTER TABLE employees DROP COLUMN IF EXISTS squad;

-- pos_id: make nullable, add FK to positions
ALTER TABLE employees ALTER COLUMN pos_id DROP NOT NULL;
ALTER TABLE employees ALTER COLUMN pos_id DROP DEFAULT;
UPDATE employees SET pos_id = NULL WHERE pos_id = 0;
ALTER TABLE employees ADD CONSTRAINT employees_pos_id_fk
  FOREIGN KEY (pos_id) REFERENCES positions(id) ON DELETE SET NULL;

-- squad_id: new nullable FK to squads
ALTER TABLE employees ADD COLUMN IF NOT EXISTS squad_id integer;
ALTER TABLE employees ADD CONSTRAINT employees_squad_id_fk
  FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE SET NULL;

-- job_title_id: new nullable FK to job_titles
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title_id integer;
ALTER TABLE employees ADD CONSTRAINT employees_job_title_id_fk
  FOREIGN KEY (job_title_id) REFERENCES job_titles(id) ON DELETE SET NULL;
