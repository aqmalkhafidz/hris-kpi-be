-- Add pos_id column to employees
ALTER TABLE employees ADD COLUMN pos_id integer NOT NULL DEFAULT 0;

-- Drop columns from employees
ALTER TABLE employees DROP COLUMN grade;
ALTER TABLE employees DROP COLUMN division;
ALTER TABLE employees DROP COLUMN manager;
