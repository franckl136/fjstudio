CREATE TABLE product_handoffs (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  mission_id uuid NOT NULL,
  actor text NOT NULL,
  command_key uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  include_document boolean NOT NULL,
  include_context boolean NOT NULL,
  dossier jsonb NOT NULL CHECK (jsonb_typeof(dossier)='object'),
  dossier_sha text NOT NULL CHECK (dossier_sha ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  proposal_id uuid,
  response_sha text CHECK (response_sha ~ '^[0-9a-f]{64}$'),
  imported_by text,
  imported_at timestamptz,
  UNIQUE(project_id,actor,command_key),
  UNIQUE(project_id,proposal_id),
  FOREIGN KEY(project_id,mission_id) REFERENCES control_missions(project_id,id),
  FOREIGN KEY(project_id,proposal_id) REFERENCES knowledge(project_id,id),
  CHECK (num_nonnulls(proposal_id,response_sha,imported_by,imported_at) IN (0,4))
);
CREATE INDEX product_handoff_mission ON product_handoffs(project_id,mission_id,created_at DESC);
