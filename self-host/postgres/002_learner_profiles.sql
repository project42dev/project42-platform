BEGIN;

CREATE TABLE user_profiles (
  installation_id text NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio text,
  organization text,
  location text,
  website_url text,
  photo_object_key text,
  photo_content_type text,
  photo_byte_length integer CHECK (
    photo_byte_length IS NULL OR photo_byte_length BETWEEN 1 AND 2097152
  ),
  photo_etag text,
  photo_updated_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (installation_id, user_id)
);

CREATE INDEX user_profiles_by_installation_updated
  ON user_profiles (installation_id, updated_at);

COMMIT;
