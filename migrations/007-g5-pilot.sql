CREATE TABLE pilot_runs (
    id uuid PRIMARY KEY,
    command_key uuid NOT NULL,
    project text NOT NULL CHECK (project='folkandjoy'),
    owner_id text NOT NULL,
    goal text NOT NULL,
    profile text NOT NULL,
    branch text NOT NULL,
    source_commit text NOT NULL CHECK (source_commit ~ '^[0-9a-f]{40}$'),
    context jsonb NOT NULL,
    criteria jsonb NOT NULL,
    policy jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    status text NOT NULL CHECK (status IN ('queued','running','blocked','review','approved','rejected','cancelled')),
    verdict text CHECK (verdict IN ('PASS','FAIL','BLOCKED','PASS WITH RESERVATIONS')),
    summary jsonb,
    decision jsonb,
    UNIQUE (owner_id,command_key)
);

CREATE TABLE pilot_tasks (
    run_id uuid NOT NULL REFERENCES pilot_runs(id),
    key text NOT NULL,
    label text NOT NULL,
    role text NOT NULL CHECK (role IN ('Implementer','Adversary','Coordinator')),
    workspace text NOT NULL,
    dependencies text[] NOT NULL,
    sources text[] NOT NULL,
    state text NOT NULL CHECK (state IN ('waiting','running','delivered','verified','interrupted','blocked','cancelled')),
    generation integer NOT NULL DEFAULT 0,
    lease_until timestamptz,
    worker_id text,
    started_at timestamptz,
    finished_at timestamptz,
    result jsonb,
    result_hash text,
    PRIMARY KEY (run_id,key),
    CHECK ((state='running')=(lease_until IS NOT NULL)),
    CHECK ((result IS NULL)=(result_hash IS NULL))
);
CREATE UNIQUE INDEX pilot_workspace_running ON pilot_tasks(run_id,workspace) WHERE state='running';
CREATE INDEX pilot_task_queue ON pilot_tasks(state,run_id);

CREATE TABLE pilot_events (
    id bigserial PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES pilot_runs(id),
    task_key text,
    kind text NOT NULL,
    actor text NOT NULL,
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX pilot_event_history ON pilot_events(run_id,id);

CREATE TABLE pilot_charges (
    run_id uuid NOT NULL,
    task_key text NOT NULL,
    generation integer NOT NULL,
    project text NOT NULL CHECK(project='folkandjoy'),
    agent text NOT NULL,
    provider text NOT NULL CHECK(provider='local-deterministic'),
    estimated_cents integer NOT NULL CHECK(estimated_cents=0),
    actual_cents integer CHECK(actual_cents=0),
    PRIMARY KEY(run_id,task_key,generation),
    FOREIGN KEY(run_id,task_key) REFERENCES pilot_tasks(run_id,key)
);
