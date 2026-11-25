CREATE TABLE projects (
    id text PRIMARY KEY CHECK (id IN ('a', 'b')),
    name text NOT NULL,
    context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object')
);

INSERT INTO projects (id, name, context) VALUES
    ('a', 'Projet synthétique A', '{"description":"Jeu de qualification A1 du projet A.","classification":"synthetic"}'),
    ('b', 'Projet synthétique B', '{"description":"Jeu indépendant pour vérifier le cloisonnement.","classification":"synthetic"}');

CREATE TABLE missions (
    id uuid PRIMARY KEY,
    project_id text NOT NULL REFERENCES projects(id),
    created_by text NOT NULL,
    command_key text NOT NULL,
    fixture_id text NOT NULL CHECK (fixture_id IN ('nominal', 'incorrect')),
    fixture jsonb NOT NULL CHECK (jsonb_typeof(fixture) = 'object'),
    plan_version text NOT NULL,
    plan jsonb NOT NULL CHECK (jsonb_typeof(plan) = 'object'),
    status text NOT NULL CHECK (status IN ('ready', 'running', 'succeeded', 'failed', 'cancelled')),
    reason text,
    max_attempts integer NOT NULL CHECK (max_attempts > 0),
    lease_ms integer NOT NULL CHECK (lease_ms > 0),
    created_at timestamptz NOT NULL,
    deadline_at timestamptz NOT NULL CHECK (deadline_at > created_at),
    UNIQUE (project_id, id),
    UNIQUE (project_id, created_by, command_key)
);

CREATE INDEX missions_project_created_idx ON missions (project_id, created_at, id);
CREATE INDEX missions_deadline_idx ON missions (deadline_at) WHERE status IN ('ready', 'running');

CREATE TABLE steps (
    project_id text NOT NULL,
    mission_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('preparer', 'verifier')),
    status text NOT NULL CHECK (status IN ('waiting', 'ready', 'running', 'succeeded', 'failed', 'cancelled')),
    generation integer NOT NULL DEFAULT 0 CHECK (generation >= 0),
    PRIMARY KEY (project_id, mission_id, role),
    FOREIGN KEY (project_id, mission_id) REFERENCES missions(project_id, id)
);

CREATE INDEX steps_ready_idx ON steps (project_id, role, mission_id) WHERE status = 'ready';

CREATE TABLE attempts (
    id uuid PRIMARY KEY,
    project_id text NOT NULL,
    mission_id uuid NOT NULL,
    role text NOT NULL,
    generation integer NOT NULL CHECK (generation > 0),
    runner_id text NOT NULL,
    status text NOT NULL CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
    started_at timestamptz NOT NULL,
    lease_until timestamptz NOT NULL,
    finished_at timestamptz,
    CHECK ((status = 'active') = (finished_at IS NULL)),
    FOREIGN KEY (project_id, mission_id, role) REFERENCES steps(project_id, mission_id, role),
    UNIQUE (project_id, mission_id, role, id),
    UNIQUE (project_id, mission_id, role, generation)
);

CREATE UNIQUE INDEX attempts_one_active_per_step
    ON attempts (project_id, mission_id, role) WHERE status = 'active';
CREATE INDEX attempts_active_lease_idx ON attempts (lease_until) WHERE status = 'active';

CREATE TABLE checkpoints (
    project_id text NOT NULL,
    mission_id uuid NOT NULL,
    role text NOT NULL,
    attempt_id uuid NOT NULL,
    artifact jsonb NOT NULL CHECK (jsonb_typeof(artifact) = 'object'),
    digest text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (project_id, mission_id, role),
    FOREIGN KEY (project_id, mission_id, role, attempt_id)
        REFERENCES attempts(project_id, mission_id, role, id)
);

CREATE TABLE mission_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id text NOT NULL,
    mission_id uuid NOT NULL,
    role text,
    type text NOT NULL,
    details jsonb CHECK (details IS NULL OR jsonb_typeof(details) = 'object'),
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (project_id, mission_id) REFERENCES missions(project_id, id),
    FOREIGN KEY (project_id, mission_id, role) REFERENCES steps(project_id, mission_id, role)
);

CREATE INDEX mission_events_history_idx ON mission_events (project_id, mission_id, id);
