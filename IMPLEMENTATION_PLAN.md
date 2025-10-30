# Implementation Plan: Company Intelligence Platform with Multi-Agent Pipeline

## Overview
Building a scalable "digital twin" knowledge graph for companies with AI agents, vector search, and strict data governance. The system will use PostgreSQL with pgvector for entities/documents/facts, store plaintext backups, use controlled vocabularies (picklists), and enforce zero-trust write paths through stored procedures.

## Phase 1: Database Foundation (Priority: CRITICAL) ✅ IN PROGRESS

### 1.1 Core Schema Setup
**Tables to create:**
- **Determined Data (Picklists):**
  - `code_sets` - Control vocabularies (doc_type, addr_type, contact_kind, rel_type, scheme, language)
  - `code_values` - Enumerated values for each set with active/inactive flags

- **Core Entities:**
  - `entities` - Companies (legal_name, org_type, status, website, country, founded/dissolved dates)
  - `entity_aliases` - Trading names, former names, tickers, domains
  - `entity_identifiers` - LEI, VAT, registry numbers, DUNS, Wikidata (UNIQUE on id_type+id_value)
  - `entity_addresses` - Normalized addresses with geolocation
  - `entity_contacts` - E.164 phones, emails, URLs (one row per item)
  - `entity_classifications` - ISIC/NACE/NAICS codes with provenance
  - `relationships` - Parent/subsidiary/owner/officer edges with temporal data

- **Documents & Vectors:**
  - `documents` - Press releases/filings with **raw_text** (plaintext backup), normalized_text, content_hash (dedupe), storage_url (binary), tsvector for full-text search
  - `doc_chunks` - Chunked segments for precise retrieval
  - `doc_embeddings` - Vectors per chunk with model versioning (HNSW index)
  - `model_versions` - Track embedding model family/version/dims

- **Facts with Evidence:**
  - `facts` - Normalized claims (subject, predicate, object_json, qualifiers) with evidence_doc_id, confidence, unique_hash, status (admitted|quarantined|retracted)

- **Provenance & Operations:**
  - `sources` - Attribution and licensing
  - `ingestion_runs` - Each crawl/ingestion session
  - `validation_results` - Great Expectations/dbt outcomes
  - `change_log` - Audit trail (who/what/when)
  - `agents` - Agent registry with roles
  - `agent_tasks` - Task definitions with scheduling

**Extensions required:**
- `uuid-ossp` (UUID generation)
- `citext` (case-insensitive text)
- `vector` (pgvector for embeddings)

**Key constraints:**
- UNIQUE(id_type, id_value) on entity_identifiers
- LEI format validation: `CHECK (id_type <> 'LEI' OR id_value ~ '^[A-Z0-9]{20}$')`
- Generated tsvector columns on entities and documents for hybrid search
- HNSW index on doc_embeddings for fast ANN search

### 1.2 Stored Procedures (Zero-Trust Write Path)
**Functions to implement:**
1. **`upsert_entity_and_children(...)`** - Create/update company + identifiers/addresses/contacts/classifications atomically (returns entity_id)
2. **`add_relationship(...)`** - Add edges with provenance and temporal bounds
3. **`upsert_document(...)`** - Store press release/filing with plaintext backup + metadata; dedupe by content_hash
4. **`add_doc_chunk_and_embedding(...)`** - Append chunks + vectors with model version tracking

**Security model:**
- Create `agent_writer` role with EXECUTE ONLY on stored procs
- REVOKE all direct INSERT/UPDATE/DELETE on base tables
- All agent writes go through these safe entry points

### 1.3 Indexes & Performance
- B-tree on entity_id, country_iso2, doc_type, published_at
- GIN indexes on tsvector columns (entities.search_tsv, documents.text_tsv)
- HNSW index on doc_embeddings.embedding with vector_cosine_ops
- Consider monthly partitioning on documents table when volume grows

## Phase 2: Authentication & Authorization (Priority: HIGH) ✅ IN PROGRESS

### 2.1 User System
**Tables:**
- `profiles` (extends auth.users) - Display name, avatar, created_at
  - Trigger on auth.users INSERT to auto-create profile

**Roles System (CRITICAL SECURITY):**
- Create `app_role` enum: `('admin', 'analyst', 'viewer')`
- `user_roles` table with (user_id, role) - separate from profiles to prevent privilege escalation
- `has_role(user_id, role)` SECURITY DEFINER function to check roles without RLS recursion

### 2.2 Row Level Security (RLS)
**Policies to create:**
- `entities` - All authenticated users can SELECT; only admins can INSERT/UPDATE/DELETE
- `documents` - All authenticated can SELECT; agents + admins can write
- `facts` - All authenticated can SELECT; only Writer agents + admins can INSERT
- `ingestion_runs`, `validation_results` - Analysts+ can view; admins can manage
- `user_roles` - Only admins can SELECT/INSERT/UPDATE/DELETE

**Policy pattern:**
```sql
CREATE POLICY "Admins full access" ON entities
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
```

### 2.3 Auth Flow
- Email/password signup with auto-confirm enabled (Settings → Authentication → Email)
- Create `/auth` page with Login + Signup tabs
- Redirect authenticated users from /auth to /
- Check session on protected pages; redirect to /auth if not authenticated
- Use `supabase.auth.onAuthStateChange` to track session state

## Phase 3: Edge Functions for AI Agents (Priority: HIGH) ⏳ TODO

**Reference:** Detailed OpenAI API patterns in `docs/OPENAI_INTEGRATION_GUIDE.md`

### 3.1 AI Model Selection Strategy

**Lovable AI vs OpenAI Direct:**
- **Default:** Use Lovable AI (`google/gemini-2.5-flash`) for most agents - pre-configured, no API key needed
- **Consider OpenAI Direct** for:
  - Long context needs (>200K tokens) → Use `gpt-4.1-mini` (1M token context)
  - Highest quality embeddings → Use `text-embedding-3-large` (3072 dimensions)
  - Cost optimization for simple tasks → Use `gpt-5-nano`

**Recommended Model Mapping:**
- `research-agent`: `gpt-4.1-mini` (long documents) OR Lovable AI `google/gemini-2.5-flash`
- `resolver-agent`: `gpt-5-nano` (simple deduplication)
- `writer-agent`: `gpt-5-mini` (structured outputs)
- `critic-agent`: `gpt-5-mini` (reasoning for QA)
- `arbiter-agent`: `gpt-5-nano` (rule application)
- `embedding-agent`: `text-embedding-3-large` (best quality vectors)

**CRITICAL: GPT-5+ Parameter Changes:**
- Use `max_completion_tokens` (NOT `max_tokens`)
- Do NOT include `temperature` parameter (defaults to 1.0)
- See OPENAI_INTEGRATION_GUIDE.md Section 1

### 3.2 Core Agent Functions

**Implementation Pattern:** Use OpenAI Function Calling for structured outputs (OPENAI_INTEGRATION_GUIDE.md Section 3)

**Function: `research-agent`**
- **Purpose:** Extract entities, relationships, facts from documents
- **Input:** `{ document_url, document_text, company_name }`
- **Model:** `gpt-4.1-mini` (1M context) OR Lovable AI `google/gemini-2.5-flash`
- **Tool Use:** Function calling with strict schema:
  ```typescript
  {
    entities: [{ legal_name, entity_type, identifiers: {lei, vat, registry_id}, website }],
    relationships: [{ from_entity, relationship_type, to_entity, confidence }],
    facts: [{ subject, predicate, object, confidence, evidence_text }]
  }
  ```
- **Output:** Validated structured data ready for writer-agent
- **Security:** Public function (verify_jwt = false) with rate limiting
- **Error Handling:** Exponential backoff for rate limits (OPENAI_INTEGRATION_GUIDE.md Section 9)

**Function: `resolver-agent`**
- **Purpose:** Deduplicate/merge companies against existing entities
- **Input:** `{ candidate_entities, identifiers[] }`
- **Model:** `gpt-5-nano` (fast, simple logic)
- **Process:**
  1. Check LEI/VAT/registry IDs first (exact match)
  2. If no match, fuzzy search on legal_name using pg_trgm
  3. Calculate confidence score (0.0-1.0)
- **Output:** `{ entity_id, match_confidence, is_new }`
- **Calls:** `upsert_entity_and_children()` stored proc if new entity needed

**Function: `writer-agent`**
- **Purpose:** Safe database writes via controlled entry point
- **Input:** `{ entity_data, document_data, fact_data }`
- **Model:** `gpt-5-mini` (structured JSON generation)
- **Authorization:** Requires JWT with 'admin' or 'agent_writer' role
- **Pattern:** Use function calling to generate validated procedure calls (OPENAI_INTEGRATION_GUIDE.md Section 3)
- **Calls:** Database insert/update via Supabase client (NOT raw SQL)
- **Logging:** All operations logged to `ingestion_runs` table
- **Error handling:** Return detailed errors; never expose raw SQL

**Function: `critic-agent`**
- **Purpose:** QA validation - contradiction detection, citation verification
- **Input:** `{ fact_id }`
- **Model:** `gpt-5-mini` (reasoning for quality checks)
- **Tool Use:** Function calling for structured validation output:
  ```typescript
  {
    is_valid: boolean,
    confidence_score: 0.0-1.0,
    issues: [{ issue_type, description, severity }],
    recommendation: 'approve' | 'quarantine' | 'reject'
  }
  ```
- **Checks:**
  - Fact has valid evidence_doc_id
  - Confidence scores in range (0.0-1.0)
  - No contradictions (same subject+predicate, different objects)
  - Required citations present
- **Output:** Validation result stored in `validation_results` table
- **Pattern:** See OPENAI_INTEGRATION_GUIDE.md Section 3

**Function: `arbiter-agent`**
- **Purpose:** Policy & safety gate (ALLOW/QUARANTINE/BLOCK)
- **Input:** `{ validation_results }`
- **Model:** `gpt-5-nano` (simple rule application)
- **Moderation:** Use OpenAI Moderation API to detect harmful content/PII (OPENAI_INTEGRATION_GUIDE.md Section 8)
- **Rules:**
  - BLOCK if contradiction detected
  - BLOCK if missing required citations
  - QUARANTINE if confidence < 0.5
  - BLOCK if moderation API flags content
- **Action:** Update `facts.status` to 'verified', 'quarantined', or 'rejected'
- **Output:** `{ decision, reason, affected_fact_ids }`

**Function: `embedding-agent`**
- **Purpose:** Generate vector embeddings for document chunks
- **Input:** `{ document_id, document_text }`
- **Model:** `text-embedding-3-large` (3072 dims, best quality) OR `text-embedding-3-small` (1536 dims, faster)
- **Process:**
  1. Split document into ~500 token chunks
  2. Batch embed chunks (max 8191 tokens per chunk)
  3. Store embeddings in `documents.embedding` column (pgvector)
  4. Track model version
- **Output:** `{ embedding_count, model_version }`
- **Pattern:** See OPENAI_INTEGRATION_GUIDE.md Section 7 for chunking strategy
- **Cost:** text-embedding-3-large is $0.13/1M tokens (as of 2025)

### 3.3 Coordinator Function (TypeScript Multi-Agent Orchestration)

**Note:** OpenAI Agents SDK is Python-only; we implement custom orchestration in TypeScript  
**Reference:** OPENAI_INTEGRATION_GUIDE.md Section 6 for sequential agent pattern

**Function: `coordinator`**
- **Purpose:** Orchestrate research → resolve → write → embed → critic → arbiter workflow
- **Input:** `{ company_name, document_url }`
- **Implementation Pattern:**
  ```typescript
  // Sequential agent execution with error handling
  1. research-agent → Extract entities/facts from document
  2. resolver-agent → Deduplicate entities
  3. writer-agent → Store via safe write path
  4. embedding-agent → Generate vectors
  5. critic-agent → Validate facts
  6. arbiter-agent → Apply policy gates
  7. Log complete workflow to ingestion_runs
  ```
- **Output:** `{ ingestion_run_id, entity_ids, facts_approved, facts_quarantined }`
- **Error Handling:** Rollback on critical failures; log partial successes

### 3.4 Edge Function Configuration
**supabase/config.toml updates:**
```toml
[functions.research-agent]
verify_jwt = false

[functions.resolver-agent]
verify_jwt = true

[functions.writer-agent]
verify_jwt = true

[functions.critic-agent]
verify_jwt = true

[functions.arbiter-agent]
verify_jwt = true

[functions.embedding-agent]
verify_jwt = true

[functions.coordinator]
verify_jwt = true
```

## Phase 4: Frontend Integration (Priority: MEDIUM) ⏳ TODO

### 4.1 Company Search Enhancement
**Current component:** `CompanySearch.tsx`
**Add:**
- Real Supabase queries to `entities` table
- Search by name (tsvector), LEI, VAT, domain (via entity_aliases)
- Display full entity details: identifiers, addresses, contacts, classifications, relationships
- Use TypeScript types from `src/integrations/supabase/types.ts` (auto-generated post-migration)

### 4.2 Document Library Enhancement
**Current component:** `DocumentLibrary.tsx`
**Add:**
- Query `documents` table with filters (entity_id, doc_type, date range)
- Hybrid search: tsvector (BM25) + vector similarity
- Display: title, published_at, doc_type, source, storage_url (download link)
- Inline preview of raw_text with highlighting

### 4.3 Facts Browser Enhancement
**Current component:** `FactsBrowser.tsx`
**Add:**
- Query `facts` table filtered by entity
- Display: subject (company name), predicate, object_json, confidence, status
- Link to evidence_doc_id (jump to document)
- Color-code by status (admitted=green, quarantined=yellow, retracted=red)

### 4.4 Ingestion Monitor Enhancement
**Current component:** `IngestionMonitor.tsx`
**Add:**
- Real-time display of `ingestion_runs` with status
- Link to `validation_results` for each run
- Show metrics: rows_ingested, duration, errors
- Manual trigger button for coordinator function (admin only)

### 4.5 Admin Dashboard (NEW)
**Create:** `src/components/AdminDashboard.tsx`
**Features:**
- User role management (view/assign roles)
- Agent status (active/inactive agents)
- Source management (add/edit sources)
- Code set management (add/edit picklists)
- Manual ingestion trigger with params

## Phase 5: Vector Search & Hybrid Retrieval (Priority: MEDIUM) ⏳ TODO

### 5.1 Semantic Search API
**Edge function:** `semantic-search`
**Input:** `{ query_text, entity_id?, doc_type?, date_range?, limit=20 }`
**Process:**
1. Generate query embedding (same model as doc_embeddings)
2. Filter: WHERE entity_id = ? AND doc_type = ? AND published_at BETWEEN ? AND ?
3. Vector rank: ORDER BY embedding <-> query_vector (cosine distance)
4. Optionally INTERSECT with BM25 results from text_tsv
5. Return: doc chunks with distance scores + metadata

**Query pattern:**
```sql
SELECT c.doc_id, c.chunk_index, e.embedding <-> $1 AS distance, c.text, d.title, d.published_at
FROM doc_embeddings e
JOIN doc_chunks c ON c.chunk_id = e.chunk_id
JOIN documents d ON d.doc_id = c.doc_id
WHERE d.entity_id = $2
  AND d.doc_type = $3
  AND d.published_at >= $4
ORDER BY e.embedding <-> $1
LIMIT 20;
```

### 5.2 Frontend Search Component
**Create:** `src/components/SemanticSearch.tsx`
**Features:**
- Natural language query input
- Entity/doc type filters
- Display results with relevance scores
- Click to view full document
- Highlight matching chunks

## Phase 6: Quality Assurance & Monitoring (Priority: LOW) ⏳ TODO

### 6.1 dbt Source Freshness
**File:** `dbt_sources.yml` (already provided)
**Setup:**
- Configure dbt project to point at Supabase DB
- Run `dbt source freshness` on schedule (daily)
- Alert if sources stale beyond SLA (warn: 24h, error: 48h)

### 6.2 Great Expectations Suites
**Files:** `gx_entities.json`, `gx_entity_identifiers.json` (already provided)
**Checks:**
- Schema validation (columns exist, types correct)
- Non-null constraints (legal_name, id_type, id_value)
- Uniqueness (entities.legal_name, entity_identifiers(id_type,id_value))
- LEI format regex
- Reference integrity (foreign keys valid)

### 6.3 Deployment Gates
**CI/CD integration:**
- Run GE suites pre-deploy
- BLOCK deployment if:
  - Contradiction rate > 0%
  - Missing citations > 0%
  - Policy violations > 0%
  - Critical GE tests fail

## Phase 7: Storage & File Management (Priority: LOW) ⏳ TODO

### 7.1 Supabase Storage Buckets
**Create buckets:**
- `press-releases` (public: true) - Original PDFs/HTML
- `filings` (public: true) - Regulatory documents
- `exports` (public: false) - User-generated exports

**RLS policies:**
- press-releases/filings: All authenticated users can SELECT; agents can INSERT
- exports: Users can only access their own files

### 7.2 Document Upload Flow
1. User uploads file via frontend
2. Upload to Supabase Storage bucket
3. Get public URL (storage_url)
4. Extract text (OCR if needed)
5. Call `upsert_document()` with raw_text + storage_url
6. Trigger embedding-agent to chunk + vectorize

## Phase 8: Testing & Validation (Priority: MEDIUM) ⏳ TODO

### 8.1 Unit Tests
- Test stored procedures with sample data
- Test edge functions with mock requests
- Validate RLS policies with different user roles

### 8.2 Integration Tests
- End-to-end ingestion flow (research → resolve → write → validate)
- Multi-agent coordination
- Vector search accuracy

### 8.3 Load Testing
- Concurrent ingestion runs
- Large document processing (10K+ chunks)
- Vector search at scale (1M+ embeddings)

## Implementation Timeline

**Sprint 1 (Week 1):** ✅ COMPLETE
1. ✅ Run database migrations (all schema + stored procs)
2. ✅ Set up authentication (profiles + roles)
3. ✅ Enable RLS policies
4. ✅ Test stored procedures manually

**Sprint 2 (Week 2):** ✅ COMPLETE
5. ✅ Create research-agent, resolver-agent edge functions
6. ✅ Integrate with Lovable AI (Gemini 2.5 Flash)
7. ✅ Test agent writes via stored procs

**Sprint 3 (Week 3):** ✅ COMPLETE
8. ✅ Create critic-agent, arbiter-agent edge functions
9. ✅ Build coordinator orchestration with retry logic
10. ✅ Frontend integration (real queries)

**Sprint 4 (Week 4):** ⏳ TODO
11. Implement vector search + hybrid retrieval
12. Add semantic search UI
13. Admin dashboard

**Sprint 5 (Week 5):** ⏳ TODO
14. Storage buckets + document upload
15. dbt + Great Expectations setup
16. Deployment gates

**Sprint 6 (Week 6):** ⏳ TODO
17. Load testing + optimization
18. Documentation + runbook
19. Production deployment

## Security Checklist
- ✅ Separate user_roles table (prevent privilege escalation)
- ✅ SECURITY DEFINER function for role checks (avoid RLS recursion)
- ✅ RLS on all tables with proper policies
- ✅ Input validation (confidence clamping, status validation)
- ✅ No PII in logs (truncated content in message_logs)
- ⏳ Stored procedures only (currently using direct inserts with RLS)
- ⏳ Rate limiting on public edge functions
- ⏳ Content-addressed storage (dedupe by hash)
- ⏳ Full audit trail (change_log for all mutations)

## Success Metrics
- **Data Quality:** Contradiction rate < 1%, citation coverage > 95%
- **Freshness:** Sources updated within 24h SLA
- **Performance:** Vector search p95 < 500ms, hybrid search < 1s
- **Scale:** Support 100K entities, 1M documents, 10M facts
- **Uptime:** 99.9% availability for query APIs

## Notes
- Using Lovable Cloud (Supabase) for backend
- Lovable AI enabled for agent functions (google/gemini-2.5-flash default)
- All changes tracked in this document
- Update status as phases complete
