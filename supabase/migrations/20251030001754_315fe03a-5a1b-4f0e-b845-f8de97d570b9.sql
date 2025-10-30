-- Create model configurations table for model-agnostic AI calls
CREATE TABLE IF NOT EXISTS public.model_configurations (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_family_code TEXT NOT NULL UNIQUE,
  api_endpoint TEXT NOT NULL,
  supports_temperature BOOLEAN DEFAULT true,
  temperature_default NUMERIC,
  supports_seed BOOLEAN DEFAULT false,
  reasoning_effort_levels TEXT[],
  max_output_tokens_param TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.model_configurations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view model configurations
CREATE POLICY "Anyone can view model configurations"
  ON public.model_configurations
  FOR SELECT
  USING (true);

-- Only admins can manage model configurations
CREATE POLICY "Admins manage model configurations"
  ON public.model_configurations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default model configurations
INSERT INTO public.model_configurations (model_family_code, api_endpoint, supports_temperature, temperature_default, supports_seed, reasoning_effort_levels, max_output_tokens_param) VALUES
  ('gemini-2.5-flash', 'https://ai.gateway.lovable.dev/v1/chat/completions', true, 0.7, false, NULL, 'max_tokens'),
  ('gemini-2.5-pro', 'https://ai.gateway.lovable.dev/v1/chat/completions', true, 0.7, false, NULL, 'max_tokens'),
  ('gpt-5', 'https://api.openai.com/v1/chat/completions', false, NULL, true, ARRAY['minimal', 'low', 'medium', 'high'], 'max_completion_tokens'),
  ('gpt-5-mini', 'https://api.openai.com/v1/chat/completions', false, NULL, true, ARRAY['minimal', 'low', 'medium', 'high'], 'max_completion_tokens'),
  ('gpt-5-nano', 'https://api.openai.com/v1/chat/completions', false, NULL, true, ARRAY['minimal', 'low', 'medium', 'high'], 'max_completion_tokens'),
  ('o3-mini', 'https://api.openai.com/v1/chat/completions', false, NULL, true, ARRAY['low', 'medium', 'high'], 'max_completion_tokens');

-- Update agent_definitions table to support model selection strategy
ALTER TABLE public.agent_definitions 
ADD COLUMN IF NOT EXISTS preferred_model_family TEXT DEFAULT 'gemini-2.5-flash',
ADD COLUMN IF NOT EXISTS fallback_model_family TEXT,
ADD COLUMN IF NOT EXISTS reasoning_effort TEXT;

-- Update existing agents with model preferences
-- Research and resolver: high volume, use Lovable AI (Gemini) with temperature
UPDATE public.agent_definitions 
SET preferred_model_family = 'gemini-2.5-flash',
    reasoning_effort = NULL
WHERE name IN ('research-agent', 'resolver-agent');

-- Critic and arbiter: need determinism, can use reasoning effort
UPDATE public.agent_definitions 
SET preferred_model_family = 'gemini-2.5-flash',
    reasoning_effort = 'low'
WHERE name IN ('critic-agent', 'arbiter-agent');

-- Coordinator: orchestration, can use medium reasoning
UPDATE public.agent_definitions 
SET preferred_model_family = 'gemini-2.5-flash',
    reasoning_effort = 'medium'
WHERE name = 'coordinator';