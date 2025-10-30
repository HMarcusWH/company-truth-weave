-- Fix duplicate FK constraint causing FactsBrowser error
-- Drop the auto-generated constraint, keep the more descriptive one
ALTER TABLE facts DROP CONSTRAINT IF EXISTS facts_evidence_doc_id_fkey;

-- Link orphaned documents to their entities based on entity_name
UPDATE documents
SET entity_id = (
  SELECT id 
  FROM entities 
  WHERE legal_name::text = documents.entity_name::text
)
WHERE entity_id IS NULL
  AND entity_name IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM entities 
    WHERE legal_name::text = documents.entity_name::text
  );