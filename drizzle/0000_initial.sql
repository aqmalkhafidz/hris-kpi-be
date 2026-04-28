CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  initials text NOT NULL,
  role text NOT NULL,
  dept text NOT NULL,
  div text,
  squad text,
  position text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS divisions (
  id serial PRIMARY KEY,
  name text NOT NULL,
  head text NOT NULL,
  head_id integer NOT NULL,
  headcount integer NOT NULL DEFAULT 0,
  departments jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS departments (
  id serial PRIMARY KEY,
  name text NOT NULL,
  division text NOT NULL,
  div_id integer NOT NULL,
  head_id integer NOT NULL,
  hod text NOT NULL,
  positions integer NOT NULL DEFAULT 0,
  headcount integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS positions (
  id serial PRIMARY KEY,
  code text NOT NULL,
  title text NOT NULL,
  level text NOT NULL,
  dept text NOT NULL,
  template text NOT NULL,
  headcount integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS employees (
  id serial PRIMARY KEY,
  name text NOT NULL,
  initials text NOT NULL,
  email text NOT NULL UNIQUE,
  nip text NOT NULL,
  position text NOT NULL,
  dept text NOT NULL,
  div text NOT NULL,
  division text NOT NULL,
  manager text NOT NULL,
  squad text,
  grade text NOT NULL,
  status text NOT NULL,
  joined text NOT NULL
);

CREATE TABLE IF NOT EXISTS cycles (
  id serial PRIMARY KEY,
  name text NOT NULL,
  start_date text NOT NULL,
  end_date text NOT NULL,
  self_deadline text,
  status text NOT NULL,
  description text NOT NULL,
  distributed_at text,
  total_appraisals integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  in_review integer NOT NULL DEFAULT 0,
  draft integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kra_templates (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  dept text NOT NULL,
  level text NOT NULL,
  version text NOT NULL,
  status text NOT NULL,
  updated text NOT NULL,
  used_by integer NOT NULL DEFAULT 0,
  summary text NOT NULL
);

CREATE TABLE IF NOT EXISTS kra_template_items (
  id serial PRIMARY KEY,
  template_id integer NOT NULL REFERENCES kra_templates(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  weight integer NOT NULL,
  kpi text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appraisals (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  cycle_name text NOT NULL,
  cycle_short text NOT NULL,
  status text NOT NULL,
  reflection text NOT NULL,
  reviewer_sl_user_id integer NOT NULL,
  reviewer_sl_name text NOT NULL,
  reviewer_sl_initials text NOT NULL,
  reviewer_hod_user_id integer NOT NULL,
  reviewer_hod_name text NOT NULL,
  reviewer_hod_initials text NOT NULL,
  reviewer_hodiv_user_id integer NOT NULL,
  reviewer_hodiv_name text NOT NULL,
  reviewer_hodiv_initials text NOT NULL,
  submitted_at text,
  acknowledged_at text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kras (
  id serial PRIMARY KEY,
  appraisal_id integer NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  target text NOT NULL,
  weight integer NOT NULL,
  self_score integer NOT NULL,
  self_comment text NOT NULL,
  sl_score integer,
  sl_comment text,
  hod_score integer,
  hod_comment text,
  hodiv_score integer,
  hodiv_comment text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evidence (
  id serial PRIMARY KEY,
  kra_id integer NOT NULL REFERENCES kras(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  date text NOT NULL,
  description text,
  url text
);

CREATE TABLE IF NOT EXISTS audit_entries (
  id serial PRIMARY KEY,
  appraisal_id integer NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
  timestamp text NOT NULL,
  actor_user_id integer NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  kra_id integer
);

CREATE INDEX IF NOT EXISTS appraisals_user_id_idx ON appraisals(user_id);
CREATE INDEX IF NOT EXISTS appraisals_status_idx ON appraisals(status);
CREATE INDEX IF NOT EXISTS audit_entries_appraisal_id_idx ON audit_entries(appraisal_id);
