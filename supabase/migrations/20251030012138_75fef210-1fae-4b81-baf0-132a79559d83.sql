-- Fix critical bug: OpenAI Responses API does not support seed parameter
UPDATE model_configurations 
SET supports_seed = false 
WHERE api_version = 'responses';

COMMENT ON COLUMN model_configurations.supports_seed IS 'OpenAI Responses API does not support seed parameter';

-- Clean up orphaned runs stuck in "running" status
UPDATE runs 
SET status_code = 'failed',
    ended_at = NOW(),
    metrics_json = COALESCE(metrics_json, '{}'::jsonb) || jsonb_build_object(
      'error_message', 'Run timed out or crashed without proper cleanup',
      'auto_cleanup', true,
      'cleanup_timestamp', NOW()
    )
WHERE status_code = 'running' 
  AND started_at < NOW() - INTERVAL '5 minutes';