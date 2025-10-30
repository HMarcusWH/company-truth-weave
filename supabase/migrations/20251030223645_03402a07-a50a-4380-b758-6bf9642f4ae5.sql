-- Add comment documenting timeout status
COMMENT ON COLUMN runs.status_code IS 'Run status: running, completed, failed, timeout';

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_runs_status_created_at 
ON runs(status_code, started_at) 
WHERE status_code = 'running';