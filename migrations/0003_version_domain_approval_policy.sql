ALTER TABLE approved_email_domains
  ADD COLUMN policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version > 0);

CREATE INDEX approved_domains_by_installation_state
  ON approved_email_domains (installation_id, enabled, domain, policy_version);
