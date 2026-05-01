-- Add foreign key constraints to organization tables
-- Clean invalid rows before adding constraints (dev-safe: removes orphan/zero refs)

-- Departments: FK to divisions
DELETE FROM departments WHERE div_id IS NULL OR div_id = 0 OR div_id NOT IN (SELECT id FROM divisions);
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_divId_fk;
ALTER TABLE departments ADD CONSTRAINT departments_divId_fk FOREIGN KEY (div_id) REFERENCES divisions(id) ON DELETE RESTRICT;

-- Positions: FK to departments
DELETE FROM positions WHERE dept_id IS NULL OR dept_id = 0 OR dept_id NOT IN (SELECT id FROM departments);
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_deptId_fk;
ALTER TABLE positions ADD CONSTRAINT positions_deptId_fk FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE RESTRICT;

-- Employees: FK to divisions and departments
DELETE FROM employees WHERE div_id IS NULL OR div_id = 0 OR div_id NOT IN (SELECT id FROM divisions);
DELETE FROM employees WHERE dept_id IS NULL OR dept_id = 0 OR dept_id NOT IN (SELECT id FROM departments);
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_divId_fk;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_deptId_fk;
ALTER TABLE employees ADD CONSTRAINT employees_divId_fk FOREIGN KEY (div_id) REFERENCES divisions(id) ON DELETE RESTRICT;
ALTER TABLE employees ADD CONSTRAINT employees_deptId_fk FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE RESTRICT;

-- KRA Templates: FK to departments
DELETE FROM kra_templates WHERE dept_id IS NULL OR dept_id = 0 OR dept_id NOT IN (SELECT id FROM departments);
ALTER TABLE kra_templates DROP CONSTRAINT IF EXISTS kraTemplates_deptId_fk;
ALTER TABLE kra_templates ADD CONSTRAINT kraTemplates_deptId_fk FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE RESTRICT;

-- Squads: FK to divisions and departments
DELETE FROM squads WHERE div_id IS NULL OR div_id = 0 OR div_id NOT IN (SELECT id FROM divisions);
DELETE FROM squads WHERE dept_id IS NULL OR dept_id = 0 OR dept_id NOT IN (SELECT id FROM departments);
ALTER TABLE squads DROP CONSTRAINT IF EXISTS squads_divId_fk;
ALTER TABLE squads DROP CONSTRAINT IF EXISTS squads_deptId_fk;
ALTER TABLE squads ADD CONSTRAINT squads_divId_fk FOREIGN KEY (div_id) REFERENCES divisions(id) ON DELETE RESTRICT;
ALTER TABLE squads ADD CONSTRAINT squads_deptId_fk FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE RESTRICT;

-- Users: FK to divisions and departments
DELETE FROM users WHERE div_id IS NULL OR div_id = 0 OR div_id NOT IN (SELECT id FROM divisions);
DELETE FROM users WHERE dept_id IS NULL OR dept_id = 0 OR dept_id NOT IN (SELECT id FROM departments);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_divId_fk;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_deptId_fk;
ALTER TABLE users ADD CONSTRAINT users_divId_fk FOREIGN KEY (div_id) REFERENCES divisions(id) ON DELETE RESTRICT;
ALTER TABLE users ADD CONSTRAINT users_deptId_fk FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE RESTRICT;
