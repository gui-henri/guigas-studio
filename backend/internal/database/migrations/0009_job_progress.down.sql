ALTER TABLE jobs
  DROP COLUMN IF EXISTS progress_percent,
  DROP COLUMN IF EXISTS progress_stage;
