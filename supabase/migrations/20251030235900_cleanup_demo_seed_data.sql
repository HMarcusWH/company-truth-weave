-- Cleanup legacy demo/test data inserted during early bootstrap
-- This migration removes placeholder Acme/TechStart sample rows so that
-- production environments start from a clean slate.

-- Remove chunk embeddings that belong to demo documents
DELETE FROM public.document_chunk_embeddings
WHERE chunk_id IN (
  SELECT chunk_id
  FROM public.document_chunks
  WHERE document_id IN (
    SELECT id
    FROM public.documents
    WHERE title IN (
      'Acme Q4 2024 Earnings Report',
      'TechStart Announces New Product'
    )
       OR entity_name IN ('Acme Corporation', 'TechStart Inc.')
  )
);

-- Remove chunk rows tied to demo documents
DELETE FROM public.document_chunks
WHERE document_id IN (
  SELECT id
  FROM public.documents
  WHERE title IN (
    'Acme Q4 2024 Earnings Report',
    'TechStart Announces New Product'
  )
     OR entity_name IN ('Acme Corporation', 'TechStart Inc.')
);

-- Remove validation rows referencing demo facts
DELETE FROM public.validation_results
WHERE fact_id IN (
  SELECT id
  FROM public.facts
  WHERE subject IN ('Acme Corporation', 'TechStart Inc.')
     OR predicate IN ('revenue_2024_q4', 'founded', 'ceo')
);

-- Remove demo facts
DELETE FROM public.facts
WHERE subject IN ('Acme Corporation', 'TechStart Inc.')
   OR predicate IN ('revenue_2024_q4', 'founded', 'ceo');

-- Remove demo documents
DELETE FROM public.documents
WHERE title IN (
    'Acme Q4 2024 Earnings Report',
    'TechStart Announces New Product'
  )
   OR entity_name IN ('Acme Corporation', 'TechStart Inc.');

-- Remove demo entities
DELETE FROM public.entities
WHERE legal_name IN ('Acme Corporation', 'TechStart Inc.');

-- Remove placeholder ingestion run counters
DELETE FROM public.ingestion_runs
WHERE source_name IN ('SEC EDGAR', 'News API')
  AND documents_processed IN (150, 45);
