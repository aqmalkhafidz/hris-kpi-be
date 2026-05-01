-- Drop headcount and departments from divisions
ALTER TABLE divisions DROP COLUMN headcount;
ALTER TABLE divisions DROP COLUMN departments;

-- Drop positions and headcount from departments
ALTER TABLE departments DROP COLUMN positions;
ALTER TABLE departments DROP COLUMN headcount;

-- Drop level, template, and headcount from positions
ALTER TABLE positions DROP COLUMN level;
ALTER TABLE positions DROP COLUMN template;
ALTER TABLE positions DROP COLUMN headcount;
