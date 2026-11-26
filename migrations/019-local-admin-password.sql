ALTER TABLE studio_accounts ADD COLUMN local_password_only boolean NOT NULL DEFAULT false;
ALTER TABLE studio_accounts DROP CONSTRAINT studio_accounts_check;
ALTER TABLE studio_accounts ADD CONSTRAINT studio_accounts_credentials CHECK (
  (NOT local_password_only OR (id = 'admin-local' AND role = 'admin' AND totp_secret IS NULL))
  AND (enrolled_at IS NULL OR
       (salt IS NOT NULL AND password_hash IS NOT NULL AND (local_password_only OR totp_secret IS NOT NULL)))
);
