-- Seed prompt templates, versions, and bindings for all agents
INSERT INTO prompt_templates (name, purpose, role_type_code, modality_code, task_domain)
VALUES 
  ('research-agent-prompt', 'Extract structured entities and facts from raw documents', 'system', 'json', 'information_extraction'),
  ('resolver-agent-prompt', 'Normalize and deduplicate extracted data', 'system', 'json', 'data_normalization'),
  ('critic-agent-prompt', 'Validate data for contradictions and quality issues', 'system', 'json', 'quality_assurance'),
  ('arbiter-agent-prompt', 'Apply policy gates (PII, citations, compliance)', 'system', 'json', 'policy_enforcement')
ON CONFLICT (name) DO NOTHING;

-- Create prompt versions with actual content
INSERT INTO prompt_versions (prompt_template_id, semver, content_text, state_code, is_default)
SELECT 
  pt.prompt_template_id,
  '1.0.0',
  CASE 
    WHEN pt.name = 'research-agent-prompt' THEN 
      'You are an expert at extracting structured company intelligence from documents.

CRITICAL: You MUST use the extract_entities function to return your response.
Do NOT provide a text response. ALWAYS call the extract_entities function.

Extract:
1. Entity mentions (company names, people, locations)
2. Relationships (CEO, parent company, subsidiary)
3. Facts with evidence spans and confidence scores (0.0-1.0)

For each fact, include:
- statement: The factual claim
- evidence: Direct quote from source text
- evidence_span: {start: char_offset, end: char_offset}
- confidence: Score from 0.0 (uncertain) to 1.0 (certain)
- entity_name: Primary entity this fact relates to'
    
    WHEN pt.name = 'resolver-agent-prompt' THEN
      'Normalize and deduplicate extracted entities and facts.
      
Tasks:
1. Canonical naming (e.g., "Google Inc." → "Google LLC")
2. Deduplicate entities with same identity
3. Validate fact consistency
4. Enrich with derived attributes'
    
    WHEN pt.name = 'critic-agent-prompt' THEN
      'Validate extracted data for quality issues.
      
Check for:
1. Contradictions between facts
2. Missing evidence or weak citations
3. Confidence score appropriateness
4. Entity resolution errors

Return validation results with issues flagged.'
    
    WHEN pt.name = 'arbiter-agent-prompt' THEN
      'Apply policy gates to determine if data should be stored.
      
Policy checks:
1. PII detection (reject personal data)
2. Evidence quality (reject low-confidence claims)
3. Bias/toxicity screening
4. Regulatory compliance

Return policy decision: ALLOW or REJECT with reasons.'
  END,
  'approved',
  true
FROM prompt_templates pt
WHERE pt.name IN ('research-agent-prompt', 'resolver-agent-prompt', 'critic-agent-prompt', 'arbiter-agent-prompt')
ON CONFLICT (prompt_template_id, semver) DO NOTHING;

-- Bind prompts to agents in prod environment
INSERT INTO prompt_bindings (agent_id, prompt_version_id, env_code, traffic_weight, effective_from)
SELECT 
  ad.agent_id,
  pv.prompt_version_id,
  'prod',
  100,
  NOW()
FROM agent_definitions ad
JOIN prompt_templates pt ON pt.name = ad.name || '-prompt'
JOIN prompt_versions pv ON pv.prompt_template_id = pt.prompt_template_id
WHERE ad.name IN ('research-agent', 'resolver-agent', 'critic-agent', 'arbiter-agent')
  AND pv.is_default = true
ON CONFLICT DO NOTHING;

-- Configure agent tools
UPDATE agent_definitions
SET tools_allowed = ARRAY['extract_entities']
WHERE name = 'research-agent';

UPDATE agent_definitions
SET tools_allowed = ARRAY['normalize_data', 'deduplicate_entities']
WHERE name = 'resolver-agent';

UPDATE agent_definitions
SET tools_allowed = ARRAY['validate_facts', 'check_contradictions']
WHERE name = 'critic-agent';

UPDATE agent_definitions
SET tools_allowed = ARRAY['apply_policy_gates', 'detect_pii']
WHERE name = 'arbiter-agent';