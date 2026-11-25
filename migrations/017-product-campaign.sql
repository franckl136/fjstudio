CREATE TABLE product_campaigns (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) CHECK (project_id = 'a'),
  finished_at timestamptz NOT NULL,
  commit_sha text NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
  verdict text NOT NULL CHECK (verdict IN ('PASS','PASS WITH RESERVATIONS','FAIL','NOT QUALIFIED')),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  report_sha text NOT NULL CHECK (report_sha ~ '^[a-f0-9]{64}$')
);
CREATE INDEX product_campaigns_finished ON product_campaigns(finished_at DESC, id DESC);
