-- PromptOps Foundation Migration (Phase A + Phase B)
-- Creates code_sets/code_values picklist foundation and complete PromptOps schema

-- =========================
-- PHASE A: Code Sets Foundation
-- =========================

-- Master table for controlled vocabularies (picklists)
CREATE TABLE IF NOT EXISTS code_sets (
  code_set_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Values within each code set
CREATE TABLE IF NOT EXISTS code_values (
  code_value_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_set_id UUID NOT NULL REFERENCES code_sets(code_set_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(code_set_id, code)
);

-- Enable RLS on code tables
ALTER TABLE code_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_values ENABLE ROW LEVEL SECURITY;

-- Everyone can read code sets/values (they're controlled vocabularies)
CREATE POLICY "Anyone can view code_sets" ON code_sets FOR SELECT USING (true);
CREATE POLICY "Anyone can view code_values" ON code_values FOR SELECT USING (true);

-- Only admins can manage code sets
CREATE POLICY "Admins manage code_sets" ON code_sets FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage code_values" ON code_values FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Helper function for FK validation
CREATE OR REPLACE FUNCTION fk_code_value_ok(p_set TEXT, p_code TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM code_values cv 
    JOIN code_sets cs ON cs.code_set_id = cv.code_set_id
    WHERE cs.name = p_set AND cv.code = p_code AND cv.is_active
  );
$$;

-- Seed picklist sets (idempotent)
INSERT INTO code_sets(name, description) VALUES
  ('prompt_role_type', 'Prompt role types (system, user, tool)'),
  ('prompt_modality', 'Prompt modalities (text, json)'),
  ('workflow_node_kind', 'Workflow node kinds (planner, researcher, etc.)'),
  ('environment', 'Deployment environments'),
  ('model_family', 'Model families/models'),
  ('prompt_state', 'Prompt lifecycle states'),
  ('run_status', 'Run status states'),
  ('node_status', 'Node run status states'),
  ('message_role', 'Message roles'),
  ('guardrail_status', 'Guardrail outcomes')
ON CONFLICT (name) DO NOTHING;

-- Seed picklist values
WITH s AS (SELECT code_set_id FROM code_sets WHERE name='prompt_role_type')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('system','System', 1),
  ('user','User', 2),
  ('tool','Tool', 3)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='prompt_modality')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('text','Text', 1),
  ('json','JSON', 2)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='workflow_node_kind')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('planner','Planner', 1),
  ('researcher','Researcher', 2),
  ('solver','Solver', 3),
  ('critic','Critic', 4),
  ('arbiter','Arbiter', 5),
  ('historian','Historian', 6),
  ('tool','Tool', 7)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='environment')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('dev','Development', 1),
  ('staging','Staging', 2),
  ('prod','Production', 3)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='model_family')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('gpt-5','GPT-5', 1),
  ('gpt-5-mini','GPT-5 Mini', 2),
  ('gpt-5-nano','GPT-5 Nano', 3),
  ('gpt-4.1','GPT-4.1', 4),
  ('gpt-4.1-mini','GPT-4.1 Mini', 5),
  ('text-embedding-3-large','text-embedding-3-large', 6),
  ('gemini-2.5-flash','Gemini 2.5 Flash', 7)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='prompt_state')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('draft','Draft', 1),
  ('candidate','Candidate', 2),
  ('approved','Approved', 3),
  ('retired','Retired', 4)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='run_status')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('success','Success', 1),
  ('error','Error', 2),
  ('timeout','Timeout', 3),
  ('blocked','Blocked', 4)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='node_status')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('success','Success', 1),
  ('error','Error', 2),
  ('timeout','Timeout', 3)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='message_role')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('system','System', 1),
  ('user','User', 2),
  ('assistant','Assistant', 3),
  ('tool','Tool', 4)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

WITH s AS (SELECT code_set_id FROM code_sets WHERE name='guardrail_status')
INSERT INTO code_values(code_set_id, code, label, sort_order) 
SELECT s.code_set_id, v.code, v.label, v.sort FROM (VALUES
  ('pass','Pass', 1),
  ('warn','Warn', 2),
  ('fail','Fail', 3)
) AS v(code, label, sort), s 
ON CONFLICT (code_set_id, code) DO NOTHING;

-- =========================
-- PHASE B: PromptOps Schema
-- =========================

-- Catalog Layer: Prompt Templates
CREATE TABLE IF NOT EXISTS prompt_templates (
  prompt_template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  purpose TEXT,
  task_domain TEXT,
  role_type_code TEXT NOT NULL,
  modality_code TEXT NOT NULL,
  default_lang TEXT DEFAULT 'en',
  owner_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_role_type CHECK (fk_code_value_ok('prompt_role_type', role_type_code)),
  CONSTRAINT fk_modality CHECK (fk_code_value_ok('prompt_modality', modality_code))
);

-- Catalog Layer: Prompt Partials (reusable fragments)
CREATE TABLE IF NOT EXISTS prompt_partials (
  partial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  lang TEXT DEFAULT 'en',
  content_text TEXT NOT NULL,
  tags TEXT[],
  content_sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, version)
);

-- Catalog Layer: Prompt Versions (immutable snapshots with embeddings)
CREATE TABLE IF NOT EXISTS prompt_versions (
  prompt_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_template_id UUID NOT NULL REFERENCES prompt_templates(prompt_template_id) ON DELETE CASCADE,
  semver TEXT NOT NULL,
  content_text TEXT NOT NULL,
  blocks_json JSONB,
  variables_json JSONB,
  output_schema_json JSONB,
  safety_policies TEXT[],
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary TEXT,
  content_sha256 TEXT,
  content_embedding VECTOR(1536),
  state_code TEXT NOT NULL DEFAULT 'draft',
  canary_pct INT NOT NULL DEFAULT 0 CHECK (canary_pct BETWEEN 0 AND 100),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (prompt_template_id, semver),
  CONSTRAINT fk_prompt_state CHECK (fk_code_value_ok('prompt_state', state_code))
);

-- Index for semantic similarity search on embeddings
CREATE INDEX IF NOT EXISTS hnsw_prompt_content_embedding 
ON prompt_versions USING hnsw (content_embedding vector_cosine_ops);

-- Deployment Layer: Agent Definitions
CREATE TABLE IF NOT EXISTS agent_definitions (
  agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  role_kind_code TEXT NOT NULL,
  tools_allowed TEXT[],
  model_family_code TEXT NOT NULL,
  max_tokens INT,
  params_json JSONB,
  budgets_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_agent_role_kind CHECK (fk_code_value_ok('workflow_node_kind', role_kind_code)),
  CONSTRAINT fk_model_family CHECK (fk_code_value_ok('model_family', model_family_code))
);

-- Deployment Layer: Rollouts (for A/B testing and instant rollback)
CREATE TABLE IF NOT EXISTS rollouts (
  rollout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  env_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  CONSTRAINT fk_env CHECK (fk_code_value_ok('environment', env_code))
);

-- Deployment Layer: Prompt Bindings (deploy versions to agents with traffic weights)
CREATE TABLE IF NOT EXISTS prompt_bindings (
  binding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_definitions(agent_id) ON DELETE CASCADE,
  env_code TEXT NOT NULL,
  rollout_id UUID REFERENCES rollouts(rollout_id) ON DELETE SET NULL,
  prompt_version_id UUID NOT NULL REFERENCES prompt_versions(prompt_version_id) ON DELETE CASCADE,
  traffic_weight INT NOT NULL DEFAULT 100 CHECK (traffic_weight BETWEEN 0 AND 100),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  constraints_json JSONB,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_env_code CHECK (fk_code_value_ok('environment', env_code))
);

CREATE INDEX IF NOT EXISTS idx_bindings_agent_env ON prompt_bindings(agent_id, env_code);
CREATE INDEX IF NOT EXISTS idx_bindings_rollout ON prompt_bindings(rollout_id);

-- Deployment Layer: Workflow Templates (DAG of nodes)
CREATE TABLE IF NOT EXISTS workflow_templates (
  workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT,
  graph_json JSONB NOT NULL,
  owner_user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, version)
);

-- Runtime Layer: Runs (end-to-end executions)
CREATE TABLE IF NOT EXISTS runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflow_templates(workflow_id) ON DELETE SET NULL,
  env_code TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status_code TEXT NOT NULL DEFAULT 'success',
  metrics_json JSONB,
  decision_record_id UUID,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_run_env CHECK (fk_code_value_ok('environment', env_code)),
  CONSTRAINT fk_run_status CHECK (fk_code_value_ok('run_status', status_code))
);

CREATE INDEX IF NOT EXISTS idx_runs_env_started ON runs(env_code, started_at DESC);

-- Runtime Layer: Node Runs (per-node execution with full lineage)
CREATE TABLE IF NOT EXISTS node_runs (
  node_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  agent_id UUID REFERENCES agent_definitions(agent_id) ON DELETE SET NULL,
  prompt_version_id UUID REFERENCES prompt_versions(prompt_version_id) ON DELETE SET NULL,
  model_family_code TEXT,
  input_vars_json JSONB,
  rendered_prompt_text TEXT,
  outputs_json JSONB,
  tool_calls_json JSONB,
  model_params_json JSONB,
  tokens_input INT,
  tokens_output INT,
  latency_ms INT,
  status_code TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_node_status CHECK (fk_code_value_ok('node_status', status_code)),
  CONSTRAINT fk_node_model CHECK (model_family_code IS NULL OR fk_code_value_ok('model_family', model_family_code))
);

CREATE INDEX IF NOT EXISTS idx_node_runs_run ON node_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_node_runs_agent ON node_runs(agent_id);

-- Runtime Layer: Message Logs (all messages for forensics)
CREATE TABLE IF NOT EXISTS message_logs (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_run_id UUID NOT NULL REFERENCES node_runs(node_run_id) ON DELETE CASCADE,
  role_code TEXT NOT NULL,
  content_text TEXT,
  tool_name TEXT,
  tool_args_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_msg_role CHECK (fk_code_value_ok('message_role', role_code))
);

CREATE INDEX IF NOT EXISTS idx_msg_node ON message_logs(node_run_id);

-- Runtime Layer: Guardrail Results (policy/QA checks)
CREATE TABLE IF NOT EXISTS guardrail_results (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_run_id UUID REFERENCES node_runs(node_run_id) ON DELETE CASCADE,
  suite TEXT NOT NULL,
  status_code TEXT NOT NULL,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_guard_status CHECK (fk_code_value_ok('guardrail_status', status_code))
);

-- Runtime Layer: Prompt Metrics Daily (aggregated metrics per version)
CREATE TABLE IF NOT EXISTS prompt_metrics_daily (
  date DATE NOT NULL,
  prompt_version_id UUID NOT NULL REFERENCES prompt_versions(prompt_version_id) ON DELETE CASCADE,
  calls INT NOT NULL DEFAULT 0,
  pass_rate NUMERIC(5,2),
  contradiction_rate NUMERIC(5,2),
  latency_p95 INT,
  error_rate NUMERIC(5,2),
  rollback_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (date, prompt_version_id)
);

-- Governance Layer: Change Requests
CREATE TABLE IF NOT EXISTS change_requests (
  cr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  target_id UUID NOT NULL,
  proposed_by UUID REFERENCES profiles(id),
  diff_summary TEXT,
  risk_level TEXT,
  state TEXT NOT NULL DEFAULT 'open',
  approver_id UUID REFERENCES profiles(id),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Governance Layer: Approval Policies
CREATE TABLE IF NOT EXISTS approval_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  min_approvers INT NOT NULL DEFAULT 1,
  required_roles TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Governance Layer: Decision Records (ADRs)
CREATE TABLE IF NOT EXISTS decision_records (
  decision_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_ref UUID,
  context TEXT,
  options JSONB,
  decision TEXT,
  consequences TEXT,
  links TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additional indexes
CREATE INDEX IF NOT EXISTS idx_prompt_versions_state ON prompt_versions(state_code);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_template ON prompt_versions(prompt_template_id);
CREATE INDEX IF NOT EXISTS idx_prompt_bindings_effective ON prompt_bindings(agent_id, env_code, effective_from DESC);

-- =========================
-- RLS Policies
-- =========================

-- Prompt Templates: Only admins can manage
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage prompt templates" ON prompt_templates FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view prompt templates" ON prompt_templates FOR SELECT USING (true);

-- Prompt Versions: Admins manage, all can view approved
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage prompt versions" ON prompt_versions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "View approved prompts" ON prompt_versions FOR SELECT USING (state_code = 'approved' OR has_role(auth.uid(), 'admin'));

-- Prompt Partials: Admins manage, all can view
ALTER TABLE prompt_partials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage partials" ON prompt_partials FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view partials" ON prompt_partials FOR SELECT USING (true);

-- Agent Definitions: Admins manage, all can view
ALTER TABLE agent_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage agents" ON agent_definitions FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view agents" ON agent_definitions FOR SELECT USING (true);

-- Rollouts: Admins manage, all can view
ALTER TABLE rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage rollouts" ON rollouts FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view rollouts" ON rollouts FOR SELECT USING (true);

-- Prompt Bindings: Only admins manage
ALTER TABLE prompt_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bindings" ON prompt_bindings FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view bindings" ON prompt_bindings FOR SELECT USING (true);

-- Workflow Templates: Admins manage, all can view
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage workflows" ON workflow_templates FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view workflows" ON workflow_templates FOR SELECT USING (true);

-- Runs: Service role can insert, all authenticated can view
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can log runs" ON runs FOR INSERT WITH CHECK (true);
CREATE POLICY "All can view runs" ON runs FOR SELECT USING (true);

-- Node Runs: Service role can insert, all authenticated can view
ALTER TABLE node_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can log node runs" ON node_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "All can view node runs" ON node_runs FOR SELECT USING (true);

-- Message Logs: Service role can insert, all authenticated can view
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can log messages" ON message_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "All can view messages" ON message_logs FOR SELECT USING (true);

-- Guardrail Results: Service role can insert, all authenticated can view
ALTER TABLE guardrail_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can log guardrails" ON guardrail_results FOR INSERT WITH CHECK (true);
CREATE POLICY "All can view guardrails" ON guardrail_results FOR SELECT USING (true);

-- Prompt Metrics: System can write, all can view
ALTER TABLE prompt_metrics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System can write metrics" ON prompt_metrics_daily FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view metrics" ON prompt_metrics_daily FOR SELECT USING (true);

-- Change Requests: Authenticated can create, admins manage
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can create change requests" ON change_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "All can view change requests" ON change_requests FOR SELECT USING (true);
CREATE POLICY "Admins manage change requests" ON change_requests FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Approval Policies: Only admins
ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage approval policies" ON approval_policies FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "All can view policies" ON approval_policies FOR SELECT USING (true);

-- Decision Records: Authenticated can create, all can view
ALTER TABLE decision_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can create decision records" ON decision_records FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "All can view decision records" ON decision_records FOR SELECT USING (true);

-- =========================
-- Seed Initial Agent Definitions
-- =========================

INSERT INTO agent_definitions (name, role_kind_code, model_family_code, max_tokens) VALUES
  ('research-agent', 'researcher', 'gpt-4.1-mini', 2000),
  ('resolver-agent', 'solver', 'gpt-5-nano', 500),
  ('writer-agent', 'historian', 'gpt-5-mini', 1000),
  ('critic-agent', 'critic', 'gpt-5-mini', 1500),
  ('arbiter-agent', 'arbiter', 'gpt-5-nano', 500),
  ('embedding-agent', 'tool', 'text-embedding-3-large', 8191),
  ('coordinator', 'planner', 'gpt-5-mini', 2000)
ON CONFLICT (name) DO NOTHING;