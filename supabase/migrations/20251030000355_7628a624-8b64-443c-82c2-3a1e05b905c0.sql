-- Phase 1.2: Add citation spans to facts table
ALTER TABLE facts 
ADD COLUMN evidence_span_start INT,
ADD COLUMN evidence_span_end INT;

-- Create index for span lookups
CREATE INDEX facts_doc_span_idx ON facts(evidence_doc_id, evidence_span_start);

-- Phase 1.1: Update all prompt versions to include "unknown" pathway
UPDATE prompt_versions
SET content_text = content_text || E'\n\nCRITICAL RULE: If evidence is missing, ambiguous, or insufficient, you MUST return "unknown" or add to unknown_values field. Never fabricate, infer, or guess data. Cite exact sources for every claim.'
WHERE prompt_version_id IN (
  SELECT pv.prompt_version_id 
  FROM prompt_versions pv
  JOIN prompt_bindings pb ON pb.prompt_version_id = pv.prompt_version_id
  WHERE pb.env_code = 'dev'
    AND pb.effective_from <= NOW()
    AND (pb.effective_to IS NULL OR pb.effective_to > NOW())
);