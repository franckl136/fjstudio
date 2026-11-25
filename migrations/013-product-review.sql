CREATE TABLE product_git_reviews (
  id uuid PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) CHECK (project_id='a'),
  branch text NOT NULL CHECK (branch='feat/studio-product-foundation'),
  base_sha text NOT NULL CHECK (base_sha ~ '^[0-9a-f]{40}$'),
  head_sha text NOT NULL CHECK (head_sha ~ '^[0-9a-f]{40}$'),
  summary jsonb NOT NULL CHECK (jsonb_typeof(summary)='array'),
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(project_id,head_sha,digest)
);
CREATE TABLE product_git_decisions (
  review_id uuid NOT NULL REFERENCES product_git_reviews(id),
  actor text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('approved','changes_requested')),
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(review_id,actor)
);
CREATE INDEX product_git_review_timeline ON product_git_reviews(project_id,created_at DESC);
