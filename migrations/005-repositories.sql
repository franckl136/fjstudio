CREATE TABLE project_repositories (
    project_id text PRIMARY KEY REFERENCES projects(id),
    repository_key text NOT NULL,
    remote_url text NOT NULL,
    registered_by text NOT NULL,
    registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (project_id, repository_key)
);

CREATE TABLE repository_observations (
    id uuid PRIMARY KEY,
    project_id text NOT NULL,
    repository_key text NOT NULL,
    observed_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    observed_by text NOT NULL,
    operation text NOT NULL CHECK (operation IN ('local','fetch')),
    local_commit text NOT NULL CHECK (local_commit ~ '^[0-9a-f]{40}$'),
    branch text,
    worktree jsonb NOT NULL,
    remote_state jsonb,
    FOREIGN KEY (project_id,repository_key) REFERENCES project_repositories(project_id,repository_key),
    UNIQUE (project_id,id)
);
CREATE INDEX repository_observations_latest ON repository_observations(project_id,observed_at DESC,id);

CREATE TABLE mission_repositories (
    project_id text NOT NULL,
    mission_id uuid NOT NULL,
    observation_id uuid NOT NULL,
    PRIMARY KEY (project_id,mission_id),
    FOREIGN KEY (project_id,mission_id) REFERENCES missions(project_id,id),
    FOREIGN KEY (project_id,observation_id) REFERENCES repository_observations(project_id,id)
);
