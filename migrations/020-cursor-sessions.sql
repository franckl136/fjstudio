CREATE TABLE cursor_pull_requests (
  project_id text NOT NULL REFERENCES projects(id),
  repository text NOT NULL,
  pr_number integer NOT NULL CHECK (pr_number > 0),
  agent_id text NOT NULL CHECK (agent_id ~ '^bc-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  branch text NOT NULL,
  state text NOT NULL CHECK (state IN ('draft','open','closed','merged')),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY(project_id,repository,pr_number,agent_id)
);
