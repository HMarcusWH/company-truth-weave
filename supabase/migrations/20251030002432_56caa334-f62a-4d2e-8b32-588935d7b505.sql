-- Phase 1: Add api_version to model_configurations
ALTER TABLE model_configurations 
ADD COLUMN api_version TEXT NOT NULL DEFAULT 'chat_completions' 
  CHECK (api_version IN ('chat_completions', 'responses'));

-- Update GPT-5 models to use Responses API
UPDATE model_configurations 
SET api_version = 'responses',
    api_endpoint = 'https://api.openai.com/v1/responses'
WHERE model_family_code IN ('gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o3-mini');

-- Keep Gemini models on Chat Completions (Lovable AI doesn't support Responses yet)
UPDATE model_configurations 
SET api_version = 'chat_completions'
WHERE model_family_code LIKE 'gemini%';