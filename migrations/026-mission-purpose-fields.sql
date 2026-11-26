ALTER TABLE control_missions ADD COLUMN brief_details jsonb NOT NULL DEFAULT '{}'
  CHECK(jsonb_typeof(brief_details)='object');
