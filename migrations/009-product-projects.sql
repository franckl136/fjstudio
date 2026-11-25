ALTER TABLE projects
    ADD COLUMN profile_revision integer NOT NULL DEFAULT 0 CHECK (profile_revision >= 0),
    ADD COLUMN repository_url text NOT NULL DEFAULT '',
    ADD COLUMN main_branch text NOT NULL DEFAULT '',
    ADD COLUMN work_branches text[] NOT NULL DEFAULT '{}',
    ADD COLUMN acceptance text NOT NULL DEFAULT '';

CREATE TABLE project_profile_history (
    project_id text NOT NULL REFERENCES projects(id),
    revision integer NOT NULL CHECK (revision > 0),
    actor text NOT NULL,
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
    PRIMARY KEY (project_id, revision)
);
