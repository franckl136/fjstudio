ALTER TABLE control_missions
  ADD COLUMN purpose text NOT NULL DEFAULT 'documentation'
    CHECK (purpose IN ('analysis','development','audit','documentation','research','test','maintenance','delivery')),
  ADD COLUMN plan_mode text NOT NULL DEFAULT 'parallel' CHECK(plan_mode IN ('parallel','sequential'));
