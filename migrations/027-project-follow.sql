CREATE TABLE studio_project_follow (
  account_id text NOT NULL REFERENCES studio_accounts(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  attention text NOT NULL CHECK(attention IN ('priority','normal','standby')),
  note text NOT NULL DEFAULT '' CHECK(char_length(note)<=280),
  revision integer NOT NULL CHECK(revision>0),
  PRIMARY KEY(account_id,project_id)
);
