CREATE TABLE app_lab_sessions (
    project_id text NOT NULL REFERENCES projects(id),
    id uuid NOT NULL,
    command_key uuid NOT NULL,
    created_by text NOT NULL,
    profile text NOT NULL CHECK (profile = 'registry-fixture-v1'),
    application text NOT NULL CHECK (application = 'studio-fixture'),
    source_version text NOT NULL CHECK (source_version = 'studio-fixture-v1'),
    state text NOT NULL CHECK (state IN ('created','simulated','stopped','revoked','expired')),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (project_id,id),
    UNIQUE (project_id,created_by,command_key),
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);

CREATE UNIQUE INDEX app_lab_one_open ON app_lab_sessions(project_id)
    WHERE state IN ('created','simulated');

CREATE INDEX app_lab_recent ON app_lab_sessions(project_id,created_at DESC,id);

CREATE TABLE app_lab_events (
    seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id text NOT NULL,
    session_id uuid NOT NULL,
    state text NOT NULL CHECK (state IN ('created','simulated','stopped','revoked','expired')),
    reason text NOT NULL CHECK (reason IN ('operator','deadline','restored')),
    actor text NOT NULL,
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (project_id,session_id) REFERENCES app_lab_sessions(project_id,id),
    UNIQUE (project_id,session_id,state)
);
