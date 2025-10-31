-- Fix PUBLIC_DATA_EXPOSURE: Restrict public read access to sensitive tables
-- Replace "Anyone can view" policies with authentication requirements

-- HIGH RISK TABLES: Restrict to authenticated users only

-- runs table
DROP POLICY IF EXISTS "All can view runs" ON public.runs;
CREATE POLICY "Authenticated users can view runs"
ON public.runs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- message_logs table
DROP POLICY IF EXISTS "All can view messages" ON public.message_logs;
CREATE POLICY "Authenticated users can view messages"
ON public.message_logs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- guardrail_results table
DROP POLICY IF EXISTS "All can view guardrails" ON public.guardrail_results;
CREATE POLICY "Authenticated users can view guardrails"
ON public.guardrail_results
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- node_runs table
DROP POLICY IF EXISTS "All can view node runs" ON public.node_runs;
CREATE POLICY "Authenticated users can view node runs"
ON public.node_runs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- facts table
DROP POLICY IF EXISTS "Anyone can view facts" ON public.facts;
CREATE POLICY "Authenticated users can view facts"
ON public.facts
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- entities table
DROP POLICY IF EXISTS "Anyone can view entities" ON public.entities;
CREATE POLICY "Authenticated users can view entities"
ON public.entities
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- documents table
DROP POLICY IF EXISTS "Anyone can view documents" ON public.documents;
CREATE POLICY "Authenticated users can view documents"
ON public.documents
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- MEDIUM RISK TABLES: Restrict to authenticated users

-- document_chunks table
DROP POLICY IF EXISTS "Anyone can view document chunks" ON public.document_chunks;
CREATE POLICY "Authenticated users can view document chunks"
ON public.document_chunks
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- document_chunk_embeddings table
DROP POLICY IF EXISTS "Anyone can view chunk embeddings" ON public.document_chunk_embeddings;
CREATE POLICY "Authenticated users can view chunk embeddings"
ON public.document_chunk_embeddings
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- validation_results table
DROP POLICY IF EXISTS "Anyone can view validation results" ON public.validation_results;
CREATE POLICY "Authenticated users can view validation results"
ON public.validation_results
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- decision_records table
DROP POLICY IF EXISTS "All can view decision records" ON public.decision_records;
CREATE POLICY "Authenticated users can view decision records"
ON public.decision_records
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- ingestion_runs table
DROP POLICY IF EXISTS "Anyone can view ingestion runs" ON public.ingestion_runs;
CREATE POLICY "Authenticated users can view ingestion runs"
ON public.ingestion_runs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- company_details table
DROP POLICY IF EXISTS "Anyone can view company details" ON public.company_details;
CREATE POLICY "Authenticated users can view company details"
ON public.company_details
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- company_industries table
DROP POLICY IF EXISTS "Anyone can view company industries" ON public.company_industries;
CREATE POLICY "Authenticated users can view company industries"
ON public.company_industries
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- entity_addresses table
DROP POLICY IF EXISTS "Anyone can view entity addresses" ON public.entity_addresses;
CREATE POLICY "Authenticated users can view entity addresses"
ON public.entity_addresses
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- entity_identifiers table
DROP POLICY IF EXISTS "Anyone can view entity identifiers" ON public.entity_identifiers;
CREATE POLICY "Authenticated users can view entity identifiers"
ON public.entity_identifiers
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);