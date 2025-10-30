-- Phase B.1: Upgrade agents to top-tier models for testing/production

-- Update agent model assignments
UPDATE agent_definitions SET 
  preferred_model_family = 'gemini-2.5-pro',
  reasoning_effort = NULL
WHERE name IN ('research-agent', 'resolver-agent');

UPDATE agent_definitions SET 
  preferred_model_family = 'gpt-5',
  reasoning_effort = 'medium'
WHERE name = 'critic-agent';

UPDATE agent_definitions SET 
  preferred_model_family = 'gpt-5',
  reasoning_effort = 'high'
WHERE name = 'arbiter-agent';

UPDATE agent_definitions SET 
  preferred_model_family = 'gemini-2.5-flash',
  reasoning_effort = NULL
WHERE name = 'coordinator';

-- Add gpt-5 model configuration if not exists
INSERT INTO model_configurations (
  model_family_code, 
  api_endpoint, 
  api_version, 
  supports_seed, 
  supports_temperature,
  reasoning_effort_levels,
  max_output_tokens_param
) VALUES (
  'gpt-5',
  'https://api.openai.com/v1/responses',
  'responses',
  false,
  false,
  ARRAY['minimal', 'low', 'medium', 'high'],
  'max_completion_tokens'
) ON CONFLICT (model_family_code) DO UPDATE SET
  api_endpoint = EXCLUDED.api_endpoint,
  api_version = EXCLUDED.api_version,
  supports_seed = EXCLUDED.supports_seed,
  supports_temperature = EXCLUDED.supports_temperature,
  reasoning_effort_levels = EXCLUDED.reasoning_effort_levels,
  max_output_tokens_param = EXCLUDED.max_output_tokens_param;

-- Add gemini-2.5-pro model configuration if not exists
INSERT INTO model_configurations (
  model_family_code, 
  api_endpoint, 
  api_version, 
  supports_seed, 
  supports_temperature,
  reasoning_effort_levels,
  max_output_tokens_param
) VALUES (
  'gemini-2.5-pro',
  'https://ai.gateway.lovable.dev/v1/chat/completions',
  'chat_completions',
  true,
  true,
  NULL,
  'max_tokens'
) ON CONFLICT (model_family_code) DO UPDATE SET
  api_endpoint = EXCLUDED.api_endpoint,
  api_version = EXCLUDED.api_version,
  supports_seed = EXCLUDED.supports_seed,
  supports_temperature = EXCLUDED.supports_temperature,
  reasoning_effort_levels = EXCLUDED.reasoning_effort_levels,
  max_output_tokens_param = EXCLUDED.max_output_tokens_param;