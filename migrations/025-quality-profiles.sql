CREATE TABLE quality_profile_settings (
  project_id text NOT NULL REFERENCES projects(id), profile text NOT NULL, checks text[] NOT NULL,
  revision integer NOT NULL CHECK(revision>0), updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,profile),
  CHECK(profile IN ('quick','complete','security','database','architecture','release')),
  CHECK(cardinality(checks) BETWEEN 1 AND 11)
);
CREATE TABLE quality_profile_reviews (
  id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), profile text NOT NULL, checks text[] NOT NULL,
  revision integer NOT NULL, lab uuid, campaign uuid, schema_snapshot uuid,
  actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  command_key uuid NOT NULL, request_digest text NOT NULL CHECK(length(request_digest)=64),
  CHECK(profile IN ('quick','complete','security','database','architecture','release')),
  UNIQUE(project_id,actor,command_key)
);
CREATE INDEX quality_profile_review_history ON quality_profile_reviews(project_id,created_at DESC,id DESC);
