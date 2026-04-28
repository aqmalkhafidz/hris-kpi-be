ALTER TABLE appraisals
  ADD COLUMN calibrated_score numeric(4, 2),
  ADD COLUMN final_grade text,
  ADD COLUMN calibrated_at text;
