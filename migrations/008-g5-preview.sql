CREATE TABLE pilot_previews (
  run_id uuid PRIMARY KEY REFERENCES pilot_runs(id),
  source_commit text NOT NULL CHECK (source_commit ~ '^[0-9a-f]{40}$'),
  imported_by text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  receipt jsonb NOT NULL,
  receipt_raw bytea NOT NULL CHECK (octet_length(receipt_raw) BETWEEN 1 AND 16384),
  receipt_sha256 text NOT NULL CHECK (receipt_sha256 = encode(sha256(receipt_raw),'hex')),
  png bytea NOT NULL CHECK (octet_length(png) BETWEEN 5000 AND 175000),
  png_sha256 text NOT NULL CHECK (encode(sha256(png),'hex')=png_sha256)
);
