DROP INDEX users_by_installation_state;

CREATE INDEX users_by_installation_state
  ON users (installation_id, account_state, created_at, id);

CREATE INDEX users_by_installation_created_id
  ON users (installation_id, created_at, id);

CREATE INDEX audits_by_installation_sequence
  ON audit_events (installation_id, sequence DESC);
