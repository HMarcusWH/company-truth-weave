-- Create prompt templates for missing agents (using 'system' role_type_code)
INSERT INTO prompt_templates (name, purpose, role_type_code, modality_code, task_domain)
VALUES 
  ('resolver-agent-template', 'Normalize entities and facts to canonical schema', 'system', 'json', 'data_normalization'),
  ('critic-agent-template', 'Validate data quality and flag issues', 'system', 'json', 'data_validation'),
  ('arbiter-agent-template', 'Make approval/rejection decisions based on policies', 'system', 'json', 'decision_making'),
  ('coordinator-template', 'Orchestrate multi-agent workflows', 'system', 'json', 'workflow_orchestration')
ON CONFLICT DO NOTHING;

-- Create prompt versions with system prompts
INSERT INTO prompt_versions (prompt_template_id, semver, content_text, state_code, is_default)
SELECT 
  pt.prompt_template_id,
  '1.0.0',
  CASE pt.name
    WHEN 'resolver-agent-template' THEN 'You are a data normalization agent. Your task is to normalize entities and facts to canonical forms. For each entity, provide: original_name, canonical_name (standardized), entity_type (company/person/product/location/other). For each fact, provide: original_statement, normalized_statement (standardized phrasing), confidence_numeric (0-1). Flag any unknown_values with field name and reason. Always use the normalize_data function.'
    WHEN 'critic-agent-template' THEN 'You are a data quality critic agent. Your task is to validate normalized entities and facts for quality, consistency, and completeness. Check for: duplicate entities, contradictory facts, missing required fields, confidence score accuracy, schema compliance. Use the validate_data function to return validation results with issues array and overall is_valid boolean.'
    WHEN 'arbiter-agent-template' THEN 'You are an arbiter agent that makes final approval decisions. Review critic validation results and apply policies: APPROVE if is_valid=true and critical_issues=0; BLOCK if critical issues found; PARTIAL_APPROVE for minor issues. Use the make_decision function to return decision (APPROVED/BLOCKED/PARTIAL_APPROVED), reasoning, and actions_required array.'
    WHEN 'coordinator-template' THEN 'You are a workflow coordinator. You orchestrate multi-agent pipelines: research → resolver → critic → arbiter. Track execution status, handle errors, aggregate results. Use the coordinate_workflow function to manage state.'
  END,
  'approved',
  true
FROM prompt_templates pt
WHERE pt.name IN ('resolver-agent-template', 'critic-agent-template', 'arbiter-agent-template', 'coordinator-template')
ON CONFLICT DO NOTHING;

-- Create prompt bindings for dev environment
INSERT INTO prompt_bindings (agent_id, prompt_version_id, env_code, traffic_weight)
SELECT 
  ad.agent_id,
  pv.prompt_version_id,
  'dev',
  100
FROM agent_definitions ad
JOIN prompt_templates pt ON pt.name = ad.name || '-template'
JOIN prompt_versions pv ON pv.prompt_template_id = pt.prompt_template_id AND pv.is_default = true
WHERE ad.name IN ('resolver-agent', 'critic-agent', 'arbiter-agent', 'coordinator')
ON CONFLICT DO NOTHING;