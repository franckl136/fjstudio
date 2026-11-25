-- The brief, frozen context and checkpoints are scoped by project, including all foreign keys.
CREATE TABLE control_missions (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  objective text NOT NULL CHECK(length(objective) BETWEEN 1 AND 240),
  scope text NOT NULL CHECK(length(scope) BETWEEN 1 AND 1200),
  constraints_text text NOT NULL CHECK(length(constraints_text) <= 1200),
  document text NOT NULL CHECK(length(document) BETWEEN 1 AND 10000),
  criteria text[] NOT NULL CHECK(cardinality(criteria) BETWEEN 1 AND 12),
  risk text NOT NULL CHECK(risk IN ('normal','review')),
  duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 60),
  cost_limit_cents integer NOT NULL DEFAULT 0 CHECK(cost_limit_cents=0),
  status text NOT NULL CHECK(status IN ('draft','needs_approval','ready','running','paused','blocked','completed','failed','cancelled')),
  revision integer NOT NULL DEFAULT 1,
  source_sha256 text NOT NULL CHECK(length(source_sha256)=64),
  context jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(context)='array'),
  contract_version text NOT NULL,
  reason text,
  parent_id uuid,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz,
  UNIQUE(project_id,id),
  FOREIGN KEY(project_id,parent_id) REFERENCES control_missions(project_id,id)
);
CREATE INDEX control_project_history ON control_missions(project_id,created_at DESC,id);

CREATE TABLE control_tasks (
  project_id text NOT NULL,
  mission_id uuid NOT NULL,
  task_key text NOT NULL CHECK(task_key IN ('structure','coverage','synthesis')),
  role text NOT NULL CHECK(role IN ('preparer','verifier')),
  dependencies text[] NOT NULL,
  state text NOT NULL CHECK(state IN ('waiting','ready','running','completed','blocked','cancelled')),
  generation integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  result jsonb,
  sha256 text CHECK(length(sha256)=64),
  completed_at timestamptz,
  PRIMARY KEY(project_id,mission_id,task_key),
  FOREIGN KEY(project_id,mission_id) REFERENCES control_missions(project_id,id),
  CHECK ((state='completed')=(result IS NOT NULL AND sha256 IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX control_task_queue ON control_tasks(project_id,role,state);

CREATE TABLE control_attempts (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  mission_id uuid NOT NULL,
  task_key text NOT NULL,
  runner_id text NOT NULL,
  generation integer NOT NULL,
  state text NOT NULL CHECK(state IN ('running','completed','expired','interrupted','failed')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_until timestamptz NOT NULL,
  finished_at timestamptz,
  FOREIGN KEY(project_id,mission_id,task_key) REFERENCES control_tasks(project_id,mission_id,task_key),
  UNIQUE(project_id,mission_id,task_key,generation),
  CHECK ((state='running')=(finished_at IS NULL))
);
CREATE UNIQUE INDEX control_one_lease ON control_attempts(project_id,mission_id,task_key) WHERE state='running';
CREATE UNIQUE INDEX control_runner_quota ON control_attempts(runner_id) WHERE state='running';

CREATE TABLE control_contacts (
  project_id text NOT NULL REFERENCES projects(id),
  runner_id text NOT NULL,
  role text NOT NULL CHECK(role IN ('preparer','verifier')),
  last_seen timestamptz NOT NULL,
  PRIMARY KEY(project_id,runner_id)
);
CREATE TABLE control_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id text NOT NULL,
  mission_id uuid NOT NULL,
  actor text NOT NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(project_id,mission_id) REFERENCES control_missions(project_id,id)
);
CREATE INDEX control_mission_events ON control_events(project_id,mission_id,id);
CREATE TABLE control_commands (
  project_id text NOT NULL,
  actor text NOT NULL,
  command_key uuid NOT NULL,
  payload_sha256 text NOT NULL,
  mission_id uuid NOT NULL,
  PRIMARY KEY(project_id,actor,command_key),
  FOREIGN KEY(project_id,mission_id) REFERENCES control_missions(project_id,id)
);
