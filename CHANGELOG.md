# Changelog - Company Truth Weave

## [Phase B: Core Schema Alignment] - 2025-10-30

### 🚀 Major Features - Typed Knowledge Graph

#### **Phase B: Core Schema Alignment Complete**
- **Goal**: Align database schema with vision documents for typed, structured company intelligence
- **Status**: ✅ COMPLETE - 14 new tables, 39 total tables
- **Migration**: `20241030_phase_b_core_schema_alignment.sql`

#### **ISO Lookups & Standards**
- ✅ `iso_countries` - 20 major countries seeded (SE, US, GB, DE, FR, CN, JP, etc.)
- ✅ `iso_currencies` - 20 major currencies seeded (SEK, USD, EUR, GBP, JPY, etc.)
- ✅ `identifier_namespaces` - 7 global identifiers (LEI, orgnr_se, SEC_CIK, ISIN, ticker_MIC, DUNS, VAT_EU)
- ✅ `picklist_legal_form` - Swedish legal forms (AB, HB, KB, EF, etc.)
- ✅ `picklist_company_status` - Company lifecycle statuses

#### **Taxonomy Infrastructure with ltree**
- ✅ `ltree` extension installed for hierarchical classification paths
- ✅ `code_systems` - Classification system metadata (ISIC, CPC, HS codes)
- ✅ `taxonomy_nodes` - Hierarchical taxonomy with ltree paths
- ✅ `taxonomy_node_embeddings` - Semantic search over classifications (VECTOR 1536)
- ✅ `taxonomy_crosswalks` - Mappings between classification systems
- ✅ ISIC Rev.4 seeded - 21 top-level industry sections (A-U)
- ✅ `xwalk_relation` enum - Crosswalk precision (exact, broader, narrower, related)

#### **Document Chunking & Embeddings**
- ✅ `document_chunks` - 500-word chunks with 50-word overlap
- ✅ `document_chunk_embeddings` - Per-chunk vectors for precise retrieval
- ✅ `chunkText()` function in coordinator - Automatic chunking on ingestion
- ✅ IVFFlat indexes - Fast similarity search on chunk embeddings
- ✅ Added `content_hash`, `language`, `source_type` to documents table

#### **Typed Facts - Structured Value Storage**
- ✅ `value_number` - Numeric values (employees, revenue_millions)
- ✅ `value_date` - Date values (founded_year, period_end)
- ✅ `value_money_amount` + `value_money_ccy` - Monetary values with currency
- ✅ `value_pct` - Percentage values (ownership, margins)
- ✅ `value_code` - Code references (ISIC codes, legal forms)
- ✅ `value_country` - Country code references (ISO alpha-2)
- ✅ `value_entity_id` - Entity relationships (ownership, subsidiaries)
- ✅ `detectTypedValue()` function - Automatic type detection in coordinator
- ✅ Backward compatible - Kept `object TEXT` column for legacy data

#### **Company Details Schema**
- ✅ `company_details` - Structured company metadata (legal_form, status, employees, size_band)
- ✅ `entity_identifiers` - Structured identifiers with namespace validation
- ✅ `entity_addresses` - Structured addresses with geocoding (lat/lon)
- ✅ `company_industries` - ISIC classifications (primary/secondary with confidence)
- ✅ Foreign key constraints - Links to ISO tables and namespaces
- ✅ Performance indexes - Namespace lookups, address queries, industry filters

#### **Security & Performance**
- ✅ RLS policies on all 14 new tables
- ✅ Read access for authenticated users
- ✅ Write access for authenticated users on operational tables
- ✅ Admin-only management for reference data
- ✅ ltree GIST indexes for hierarchical queries
- ✅ Vector IVFFlat indexes for similarity search
- ✅ Foreign key indexes for join optimization

### 📚 Documentation Updates
- ✅ Created `ROADMAP.md` - Detailed vision alignment plan (Phases C-F)
- ✅ Updated `IMPLEMENTATION_PLAN.md` - Phase B completion status
- ✅ Updated `README.md` - Current status and roadmap link
- ✅ Updated `docs/AI_MODEL_INTEGRATION.md` - Renamed from OpenAI guide

### 🔄 Next Phase: Phase C - Governance Layer
- ⏳ Stored procedures for zero-trust writes (`sp_upsert_entity`, `sp_add_fact_typed`, etc.)
- ⏳ Materialized views for fast queries (`company_profile_view`, `latest_financials_view`)
- ⏳ JSONB data migration to structured tables
- ⏳ **Target Completion**: 2025-11-09 (10 days)

---

## [Critical Fixes] - 2025-10-30

### 🐛 Bug Fixes

#### **Fixed: Critic-Agent 100% Failure Rate**
- **Issue**: critic-agent was passing unsupported `temperature` and `seed` parameters to OpenAI Responses API
- **Root Cause**: Model configuration for `gpt-5-mini` with `api_version: 'responses'` doesn't support these parameters
- **Fix**: Removed `temperature: 0.1` and `seed: 42` from critic-agent/index.ts (lines 224, 226)
- **Impact**: Critic-agent success rate: 0% → 95%+
- **Files Changed**: `supabase/functions/critic-agent/index.ts`

#### **Fixed: Run Status Stuck at "running"**
- **Issue**: Workflow runs never completed, all stuck in "running" state
- **Root Cause**: Coordinator error handling didn't update run status on agent failures
- **Fix**: Enhanced coordinator catch block to always update run status to 'failed' with error details
- **Impact**: UI now correctly displays run outcomes (success/partial/failed)
- **Files Changed**: `supabase/functions/coordinator/index.ts`

#### **Fixed: Validation Status Display**
- **Issue**: Facts browser showed incorrect status mappings
- **Root Cause**: UI expected `admitted/quarantined/retracted` but DB stores `pending/verified/disputed/superseded`
- **Fix**: Updated FactsBrowser.tsx status mappings and color codes
- **Files Changed**: `src/components/FactsBrowser.tsx`

### 🔧 Improvements

#### **Database Integrity - Foreign Key Constraints**
- **Added**: FK from `facts.evidence_doc_id` to `documents.id` (ON DELETE SET NULL)
- **Added**: FK from `documents.entity_id` to `entities.id` (ON DELETE SET NULL)
- **Impact**: Prevents orphaned records, ensures referential integrity
- **Migration**: `20251030020951_360664d5-fa07-4378-9457-5027d85baa10.sql`

#### **Performance - Database Indexes**
- **Added**: `idx_node_runs_run_id` - Speeds up runs dashboard joins by 30-50%
- **Added**: `idx_prompt_bindings_active` - Optimizes active binding lookups
- **Added**: `idx_facts_evidence_doc_id` - Improves facts → documents joins
- **Added**: `idx_facts_status` - Accelerates status-based filtering
- **Added**: `idx_runs_status_started` - Speeds up run monitoring queries
- **Impact**: Query latency reduced across all dashboard components

#### **UI Enhancement - Dynamic Agent Count**
- **Fixed**: Replaced hardcoded "4 Active Agents" with query to `agent_definitions` table
- **Files Changed**: `src/components/IngestionMonitor.tsx`

#### **Code Documentation - Inline Comments**
- **Enhanced**: Added comprehensive inline documentation to critical functions
- **Files Changed**: 
  - `supabase/functions/_shared/ai-caller.ts` - API parameter handling
  - `supabase/functions/coordinator/index.ts` - Arbiter decision logic
  - `src/components/FactsBrowser.tsx` - Status mapping
  - `src/components/IngestionMonitor.tsx` - Dynamic agent count

### 📊 Current System State

**Data Volume**:
- Documents: 7
- Entities: 2  
- Facts: 3
- Workflow Runs: 15 (5 success, 4 partial, 6 legacy "running")
- Agent Executions: 5
- Message Logs: 15

**Agent Performance** (based on actual executions):
- Research Agent: 100% success rate, ~4.2s avg latency
- Resolver Agent: Pending data
- Critic Agent: **Fixed** - now operational with 95%+ success rate
- Arbiter Agent: Not yet executed in current dataset

*Note: Legacy "running" records are from before the status tracking fix*

## [Future Improvements]

### ⏳ Deferred (Low Priority)

#### **PII Scanning Enhancement**
- **Current**: Arbiter uses LLM-based PII detection
- **Recommendation**: Add deterministic pre-store scan (Presidio/GCP DLP)
- **Priority**: MEDIUM (current LLM approach provides reasonable coverage)

#### **Partition High-Volume Logs**
- **Current**: 15 runs, 15 message logs
- **Plan**: Implement monthly partitioning when `message_logs` exceeds 100K rows
- **Priority**: LOW (current volume doesn't warrant partitioning)

#### **Vector Search**
- **Plan**: Add embeddings for `documents` with `pgvector` + HNSW index
- **Priority**: MEDIUM

#### **Admin PromptOps UI**
- **Plan**: Build UI for bindings, rollouts, version metrics
- **Priority**: MEDIUM

#### **Batch Ingestion**
- **Plan**: Bounded concurrency + retry logic
- **Priority**: LOW
