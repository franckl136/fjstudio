ALTER TABLE projects DROP CONSTRAINT projects_id_check;
ALTER TABLE projects ADD CONSTRAINT projects_id_check CHECK (id ~ '^[a-z][a-z0-9-]{0,39}$');

CREATE TABLE studio_accounts (
    id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,39}$'),
    role text NOT NULL CHECK (role IN ('admin','operator','viewer')),
    enabled boolean NOT NULL DEFAULT true,
    salt bytea, password_hash bytea, totp_secret text, last_counter bigint,
    invite_digest text UNIQUE, invite_until timestamptz,
    setup_digest text UNIQUE, setup_until timestamptz,
    enrolled_at timestamptz,
    failures integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    CHECK ((enrolled_at IS NULL) OR (salt IS NOT NULL AND password_hash IS NOT NULL AND totp_secret IS NOT NULL))
);
CREATE TABLE studio_account_projects (
    account_id text NOT NULL REFERENCES studio_accounts(id),
    project_id text NOT NULL REFERENCES projects(id),
    PRIMARY KEY(account_id,project_id)
);
CREATE TABLE studio_sessions (
    digest text PRIMARY KEY, account_id text NOT NULL REFERENCES studio_accounts(id),
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX studio_sessions_expiry ON studio_sessions(expires_at);
CREATE TABLE studio_access_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor text NOT NULL, action text NOT NULL, subject text NOT NULL,
    at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE studio_backup_checks (
    id uuid PRIMARY KEY, performed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    outcome text NOT NULL CHECK (outcome IN ('verified','failed')), sha256 text, bytes bigint, detail text NOT NULL
);
