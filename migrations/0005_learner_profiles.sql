CREATE TABLE user_profiles (
  installation_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  organization TEXT,
  location TEXT,
  website_url TEXT,
  photo_object_key TEXT,
  photo_content_type TEXT,
  photo_byte_length INTEGER CHECK (
    photo_byte_length IS NULL OR photo_byte_length BETWEEN 1 AND 2097152
  ),
  photo_etag TEXT,
  photo_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, user_id)
) STRICT;

CREATE INDEX user_profiles_by_installation_updated
  ON user_profiles (installation_id, updated_at);
