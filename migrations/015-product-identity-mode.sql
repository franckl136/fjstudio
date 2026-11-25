CREATE TABLE studio_identity_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  key_fingerprint text NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
