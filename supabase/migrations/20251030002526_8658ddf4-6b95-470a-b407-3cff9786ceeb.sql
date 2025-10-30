-- Phase 4: Update agent definitions to use optimal models
-- Critic & Arbiter use GPT-5 mini (Responses API for better reasoning)
UPDATE agent_definitions 
SET preferred_model_family = 'gpt-5-mini'
WHERE name IN ('critic-agent', 'arbiter-agent');

-- Research & Resolver stay on Gemini (Chat Completions)
UPDATE agent_definitions 
SET preferred_model_family = 'gemini-2.5-flash'
WHERE name IN ('research-agent', 'resolver-agent');