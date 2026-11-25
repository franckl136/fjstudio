ALTER TABLE product_lab_runs DROP CONSTRAINT product_lab_runs_profile_check;
ALTER TABLE product_lab_runs ADD CONSTRAINT product_lab_runs_profile_check CHECK (profile IN ('structure','visual','typescript'));
ALTER TABLE product_lab_rules DROP CONSTRAINT product_lab_rules_profile_check;
ALTER TABLE product_lab_rules ADD CONSTRAINT product_lab_rules_profile_check CHECK (profile IN ('structure','visual','typescript'));
