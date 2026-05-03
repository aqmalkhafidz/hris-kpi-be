ALTER TABLE appraisals
  ADD COLUMN IF NOT EXISTS template_id integer REFERENCES kra_templates(id) ON DELETE SET NULL;

ALTER TABLE appraisals
  ADD COLUMN IF NOT EXISTS template_version text;

WITH ranked_templates AS (
  SELECT
    id,
    div_id,
    dept_id,
    pos_id,
    version,
    ROW_NUMBER() OVER (
      PARTITION BY div_id, dept_id, pos_id
      ORDER BY
        COALESCE(
          NULLIF(regexp_replace(version, '[^0-9\\.]', '', 'g'), ''),
          '0'
        )::numeric DESC,
        id DESC
    ) AS rn
  FROM kra_templates
  WHERE status = 'published'
),
best_templates AS (
  SELECT id, div_id, dept_id, pos_id, version
  FROM ranked_templates
  WHERE rn = 1
)
UPDATE appraisals a
SET
  template_id = bt.id,
  template_version = bt.version
FROM employees e
JOIN best_templates bt
  ON bt.div_id = e.div_id
 AND bt.dept_id = e.dept_id
 AND bt.pos_id = e.pos_id
WHERE a.user_id = e.id
  AND a.template_id IS NULL;
