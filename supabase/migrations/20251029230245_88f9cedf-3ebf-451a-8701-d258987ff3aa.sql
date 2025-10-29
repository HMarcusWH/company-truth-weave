-- Seed first prompt template and version for research-agent
DO $$
DECLARE
  v_template_id UUID;
BEGIN
  -- Insert prompt template for research-agent
  INSERT INTO prompt_templates (name, purpose, task_domain, role_type_code, modality_code)
  VALUES (
    'research-agent-system',
    'Extract entities and facts from company documents',
    'entity_extraction',
    'system',
    'json'
  )
  ON CONFLICT (name) DO NOTHING
  RETURNING prompt_template_id INTO v_template_id;

  -- Get template_id if it already existed
  IF v_template_id IS NULL THEN
    SELECT prompt_template_id INTO v_template_id
    FROM prompt_templates
    WHERE name = 'research-agent-system';
  END IF;

  -- Insert v1.0.0 prompt version
  INSERT INTO prompt_versions (
    prompt_template_id,
    semver,
    content_text,
    state_code,
    is_default,
    content_sha256
  )
  VALUES (
    v_template_id,
    '1.0.0',
    'You are an expert at extracting structured company intelligence from documents. Extract:

1. **Entities**: Identify company names, people, products, and locations mentioned in the text. For each entity, provide its name, type, and any aliases.

2. **Facts**: Extract factual statements with supporting evidence. Each fact should include:
   - The statement itself
   - The evidence from the document (quote or reference)
   - A confidence score (0.0-1.0) based on how certain the information is
   - The entity the fact relates to (if applicable)

Guidelines:
- Only extract facts that are explicitly stated or strongly implied in the document
- Use confidence scores appropriately: 1.0 for direct quotes, 0.8-0.9 for clear statements, 0.5-0.7 for implications
- Include the exact text that supports each fact as evidence
- For entities, capture all variations of names (e.g., "Apple Inc.", "Apple", "AAPL")

Use the extract_entities function to return the structured data.',
    'approved',
    true,
    encode(digest('research-agent-v1.0.0', 'sha256'), 'hex')
  )
  ON CONFLICT (prompt_template_id, semver) DO NOTHING;

  -- Create active binding for dev environment
  INSERT INTO prompt_bindings (
    agent_id,
    env_code,
    prompt_version_id,
    traffic_weight,
    effective_from
  )
  SELECT 
    ad.agent_id,
    'dev',
    pv.prompt_version_id,
    100,
    now()
  FROM agent_definitions ad
  CROSS JOIN prompt_versions pv
  WHERE ad.name = 'research-agent'
    AND pv.semver = '1.0.0'
    AND pv.prompt_template_id = v_template_id
  ON CONFLICT DO NOTHING;

END $$;
