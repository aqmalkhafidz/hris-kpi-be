ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT '';

INSERT INTO job_titles (code, name, description)
SELECT v.code, v.name, v.description
FROM (VALUES
  ('STAFF',  'Staff',               ''),
  ('SL',     'Squad Leader',        ''),
  ('HODEPT', 'Head of Department',  ''),
  ('HODIV',  'Head of Division',    ''),
  ('HR',     'HR',                  '')
) AS v(code, name, description)
WHERE NOT EXISTS (SELECT 1 FROM job_titles);

UPDATE employees SET org_role = UPPER(org_role);
