-- Phase 4: Add Foreign Key Constraints for referential integrity
ALTER TABLE facts
  ADD CONSTRAINT fk_facts_evidence_doc
  FOREIGN KEY (evidence_doc_id) 
  REFERENCES documents(id) 
  ON DELETE SET NULL;

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_entity
  FOREIGN KEY (entity_id) 
  REFERENCES entities(id) 
  ON DELETE SET NULL;

-- Phase 5: Add Performance Indexes for hot paths
CREATE INDEX IF NOT EXISTS idx_node_runs_run_id 
  ON node_runs(run_id);

CREATE INDEX IF NOT EXISTS idx_prompt_bindings_active 
  ON prompt_bindings(agent_id, env_code, effective_from, effective_to) 
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_facts_evidence_doc_id 
  ON facts(evidence_doc_id);

CREATE INDEX IF NOT EXISTS idx_facts_status 
  ON facts(status);

CREATE INDEX IF NOT EXISTS idx_runs_status_started 
  ON runs(status_code, started_at DESC);