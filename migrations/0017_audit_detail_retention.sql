DROP TRIGGER audit_events_are_immutable_on_update;

CREATE TRIGGER audit_events_are_immutable_on_update
BEFORE UPDATE ON audit_events
WHEN NOT (
  NEW.sequence = OLD.sequence AND
  NEW.id = OLD.id AND
  NEW.installation_id = OLD.installation_id AND
  (NEW.actor_user_id IS OLD.actor_user_id OR NEW.actor_user_id IS NULL) AND
  (NEW.actor_issuer IS OLD.actor_issuer OR NEW.actor_issuer IS NULL) AND
  (NEW.actor_subject IS OLD.actor_subject OR NEW.actor_subject IS NULL) AND
  NEW.action = OLD.action AND
  NEW.target_type = OLD.target_type AND
  (NEW.target_id IS OLD.target_id OR NEW.target_id IS NULL) AND
  NEW.request_id = OLD.request_id AND
  NEW.outcome = OLD.outcome AND
  (NEW.reason IS OLD.reason OR NEW.reason IS NULL) AND
  (NEW.metadata_json = OLD.metadata_json OR NEW.metadata_json = '{}') AND
  NEW.occurred_at = OLD.occurred_at
)
BEGIN
  SELECT RAISE(ABORT, 'audit events are immutable except for privacy redaction');
END;
