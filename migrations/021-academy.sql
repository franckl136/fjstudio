CREATE TABLE academy_notebooks (
  owner_key text PRIMARY KEY,
  stage smallint NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 6),
  practice jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(practice)='object')
);
CREATE TABLE academy_progress (
  owner_key text NOT NULL REFERENCES academy_notebooks(owner_key),
  lesson text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  evidence jsonb,
  PRIMARY KEY(owner_key,lesson),
  CHECK ((completed_at IS NULL AND evidence IS NULL) OR (completed_at IS NOT NULL AND jsonb_typeof(evidence)='object'))
);
