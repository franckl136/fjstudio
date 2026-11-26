CREATE TABLE explorer_sources (
  id uuid PRIMARY KEY, project_id text REFERENCES projects(id), environment text NOT NULL,
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100), origin text NOT NULL,
  revoked_at timestamptz, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((project_id IS NULL AND environment='studio' AND origin='maintenance') OR
         (project_id IS NOT NULL AND environment IN ('local','development','test','staging','production')
          AND origin IN ('sql','migration','prisma','postgresql'))),
  CHECK (environment<>'production' OR origin<>'postgresql')
);
CREATE UNIQUE INDEX explorer_one_studio ON explorer_sources(environment) WHERE project_id IS NULL;
CREATE UNIQUE INDEX explorer_project_source ON explorer_sources(project_id,environment,label);
CREATE TABLE explorer_snapshots (
  id uuid PRIMARY KEY, source_id uuid NOT NULL REFERENCES explorer_sources(id), captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor text NOT NULL, reference text NOT NULL DEFAULT '', digest text NOT NULL CHECK(length(digest)=64),
  structure jsonb NOT NULL CHECK(jsonb_typeof(structure)='object')
);
CREATE INDEX explorer_versions ON explorer_snapshots(source_id,captured_at DESC,id DESC);
CREATE TABLE explorer_migration_inputs (
  source_id uuid NOT NULL REFERENCES explorer_sources(id), reference text NOT NULL,
  input_digest text NOT NULL, snapshot_id uuid NOT NULL REFERENCES explorer_snapshots(id),
  PRIMARY KEY(source_id,reference,input_digest)
);
