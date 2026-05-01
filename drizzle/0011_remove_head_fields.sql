-- Remove head/headId from divisions, headId/hod from departments
ALTER TABLE divisions DROP COLUMN IF EXISTS head;
ALTER TABLE divisions DROP COLUMN IF EXISTS head_id;
ALTER TABLE departments DROP COLUMN IF EXISTS head_id;
ALTER TABLE departments DROP COLUMN IF EXISTS hod;
