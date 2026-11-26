CREATE TABLE knowledge_evidence (
  project_id text NOT NULL,
  knowledge_id uuid NOT NULL,
  version integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('git','lab','schema')),
  evidence_id uuid NOT NULL,
  actor text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(project_id,knowledge_id,version,kind,evidence_id),
  FOREIGN KEY(project_id,knowledge_id,version) REFERENCES knowledge_revisions(project_id,knowledge_id,version)
);
