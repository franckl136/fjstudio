CREATE TABLE knowledge (
    project_id text NOT NULL REFERENCES projects(id),
    id uuid NOT NULL,
    kind text NOT NULL,
    origin text NOT NULL CHECK (origin IN ('observed','imported','agent','hypothesis','human')),
    author text NOT NULL,
    reference text NOT NULL DEFAULT '',
    related_id uuid,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (project_id, id),
    FOREIGN KEY (project_id, related_id) REFERENCES knowledge(project_id, id)
);
CREATE TABLE knowledge_revisions (
    project_id text NOT NULL,
    knowledge_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    title text NOT NULL,
    content text NOT NULL,
    scope text NOT NULL CHECK (scope IN ('reference','both','nominal','incorrect')),
    status text NOT NULL CHECK (status IN ('proposed','validated','rejected','obsolete','revoked')),
    actor text NOT NULL,
    action text NOT NULL,
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (project_id, knowledge_id, version),
    FOREIGN KEY (project_id, knowledge_id) REFERENCES knowledge(project_id,id)
);
CREATE VIEW knowledge_current AS
SELECT DISTINCT ON (k.project_id,k.id) k.*, r.version,r.title,r.content,r.scope,r.status,r.actor,r.action,r.at
FROM knowledge k JOIN knowledge_revisions r ON (r.project_id,r.knowledge_id)=(k.project_id,k.id)
ORDER BY k.project_id,k.id,r.version DESC;

CREATE TABLE mission_context (
    project_id text NOT NULL,
    mission_id uuid NOT NULL,
    knowledge_id uuid NOT NULL,
    version integer NOT NULL,
    PRIMARY KEY (project_id,mission_id,knowledge_id),
    FOREIGN KEY (project_id,mission_id) REFERENCES missions(project_id,id),
    FOREIGN KEY (project_id,knowledge_id,version) REFERENCES knowledge_revisions(project_id,knowledge_id,version)
);
CREATE INDEX context_knowledge_usage ON mission_context(project_id,knowledge_id,version);
ALTER TABLE missions ADD COLUMN paused_at timestamptz;
CREATE TABLE runner_contacts (
    project_id text NOT NULL REFERENCES projects(id),
    runner_id text NOT NULL,
    role text NOT NULL CHECK (role IN ('preparer','verifier')),
    last_seen timestamptz NOT NULL,
    PRIMARY KEY(project_id,runner_id)
);
