ALTER TABLE knowledge_revisions
    ADD COLUMN confidence text CHECK (confidence IN ('low','medium','high')),
    ADD COLUMN validity text NOT NULL DEFAULT '';

CREATE OR REPLACE VIEW knowledge_current AS
SELECT DISTINCT ON (k.project_id,k.id) k.*, r.version,r.title,r.content,r.scope,r.status,r.actor,r.action,r.at,
    r.confidence,r.validity
FROM knowledge k JOIN knowledge_revisions r ON (r.project_id,r.knowledge_id)=(k.project_id,k.id)
ORDER BY k.project_id,k.id,r.version DESC;

CREATE TABLE restore_receipts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    target text NOT NULL,
    archive_sha256 text NOT NULL,
    checkpoint_count integer NOT NULL
);
