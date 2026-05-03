CREATE TABLE IF NOT EXISTS system_audit_entries (
  id serial PRIMARY KEY,
  timestamp text NOT NULL,
  actor_user_id integer NOT NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id integer,
  entity_label text,
  metadata text
);

CREATE INDEX IF NOT EXISTS system_audit_entries_entity_idx
  ON system_audit_entries(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS system_audit_entries_timestamp_idx
  ON system_audit_entries(timestamp);
