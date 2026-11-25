ALTER TABLE restore_receipts ADD COLUMN verified_table_count integer CHECK (verified_table_count >= 0);

ALTER TABLE mission_context ADD COLUMN selected_at timestamptz;
ALTER TABLE mission_context ALTER COLUMN selected_at SET DEFAULT clock_timestamp();

ALTER TABLE knowledge_revisions
    ADD COLUMN claim_key text NOT NULL DEFAULT '',
    ADD COLUMN claim_value text NOT NULL DEFAULT '',
    ADD CONSTRAINT complete_claim CHECK ((claim_key = '') = (claim_value = ''));

CREATE OR REPLACE VIEW knowledge_current AS
SELECT DISTINCT ON (k.project_id,k.id) k.*, r.version,r.title,r.content,r.scope,r.status,r.actor,r.action,r.at,
    r.confidence,r.validity,r.claim_key,r.claim_value
FROM knowledge k JOIN knowledge_revisions r ON (r.project_id,r.knowledge_id)=(k.project_id,k.id)
ORDER BY k.project_id,k.id,r.version DESC;

CREATE VIEW knowledge_disagreements AS
SELECT a.project_id, a.id AS first_id, a.version AS first_version, a.title AS first_title,
       b.id AS second_id, b.version AS second_version, b.title AS second_title,
       CASE WHEN a.claim_key <> '' AND a.claim_key = b.claim_key THEN 'assertion' ELSE 'document' END AS reason
FROM knowledge_current a JOIN knowledge_current b ON a.project_id=b.project_id AND a.id<b.id
WHERE a.status IN ('proposed','validated') AND b.status IN ('proposed','validated')
  AND (a.scope=b.scope OR 'both' IN (a.scope,b.scope) OR 'reference' IN (a.scope,b.scope))
  AND (a.validity='' OR b.validity='' OR lower(a.validity)=lower(b.validity))
  AND ((a.claim_key<>'' AND a.claim_key=b.claim_key AND lower(a.claim_value)<>lower(b.claim_value))
       OR (a.origin='imported' AND b.origin='imported' AND a.content<>b.content
           AND split_part(a.reference,' · ',1)=split_part(b.reference,' · ',1)));
