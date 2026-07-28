BEGIN;

ALTER TABLE learning_events
  ADD COLUMN schema_version text NOT NULL DEFAULT '1.0'
  CHECK (schema_version IN ('1.0', '1.1'));

ALTER TABLE learning_events
  DROP CONSTRAINT learning_events_event_type_check;

ALTER TABLE learning_events
  ADD CONSTRAINT learning_events_event_type_check CHECK (
    event_type IN (
      'path.enrolled',
      'module.visited',
      'assessment.recorded',
      'module.completed',
      'assessment.corrected',
      'progress.imported'
    )
  );

COMMIT;
