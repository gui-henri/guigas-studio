-- Render progress persistence (S5-02): the dashboard reads it on reload;
-- live updates travel over SSE.
ALTER TABLE jobs
  ADD COLUMN progress_percent int NOT NULL DEFAULT 0,
  ADD COLUMN progress_stage text NOT NULL DEFAULT '';
