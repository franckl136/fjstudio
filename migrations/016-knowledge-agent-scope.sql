ALTER TABLE knowledge_revisions DROP CONSTRAINT knowledge_revisions_scope_check;
ALTER TABLE knowledge_revisions ADD CONSTRAINT knowledge_revisions_scope_check
  CHECK (scope IN ('reference','both','nominal','incorrect','control'));
