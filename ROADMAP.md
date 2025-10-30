# Company Intelligence Platform - Roadmap to Full Knowledge Graph

> Vision Alignment Plan: From Current State to Self-Updating Company Knowledge Graph

## Vision Documents

1. **[database_schema_alignment_first_typed_core_vector_assisted_v_1.md](./database_schema_alignment_first_typed_core_vector_assisted_v_1.md)** - Detailed schema design
2. **[philosophy_alignment_first_typed_core_vector_assisted_db.md](./philosophy_alignment_first_typed_core_vector_assisted_db.md)** - Design philosophy and principles
3. **[goal_self_updating_company_knowledge_graph.md](./goal_self_updating_company_knowledge_graph.md)** - End goal and use cases

## Current Status (2025-10-30)

### ✅ Phase A: Foundation (COMPLETE)
- Multi-agent pipeline operational
- PromptOps infrastructure (versioned prompts, A/B testing, canary deployments)
- Core entity-document-fact model with provenance
- Authentication & RLS policies
- Admin UI for monitoring

### ✅ Phase B: Core Schema Alignment (COMPLETE)
- ISO lookup tables (countries, currencies)
- Identifier namespaces (LEI, orgnr_se, SEC_CIK, ISIN, ticker_MIC, DUNS, VAT_EU)
- Taxonomy infrastructure with ltree (ISIC Rev.4 seeded)
- Document chunking (500-word chunks, 50-word overlap)
- Typed facts columns (numbers, dates, money, percentages, codes)
- Company details schema (structured identifiers, addresses, industries)

**Gap Analysis:**
- ✅ Document storage: Now chunked with separate embeddings
- ✅ Facts: Now typed with `value_*` columns
- ✅ Company schema: Structured tables for identifiers, addresses
- ⏳ Taxonomy: Foundation in place, needs expansion (CPC, HS codes)
- ⏳ Stored procedures: Not yet implemented (zero-trust writes)
- ⏳ Offerings system: Not yet implemented
- ⏳ Financials: Not yet implemented
- ⏳ Ownership/Listings: Not yet implemented
- ⏳ Materialized views: Not yet implemented

---

## Phase C: Governance Layer (10 days) 🔄 NEXT

**Goal:** Implement zero-trust write path with stored procedures and fast query views.

### C.1 Stored Procedures for Zero-Trust Writes (Days 1-5)

**Rationale:** Agents should never write directly to tables. All writes go through stored procedures that enforce validation, deduplication, and business rules.

#### Procedures to Implement:

1. **`sp_upsert_entity(p_legal_name, p_entity_type, p_identifiers, p_metadata)`**
   - Check for existing entity by identifiers (LEI, orgnr_se, etc.)
   - Merge if found, insert if new
   - Return entity_id
   - Log to `change_requests` table

2. **`sp_add_fact_typed(p_subject, p_predicate, p_object, p_typed_values, p_evidence)`**
   - Validate typed values (e.g., money_ccy exists in iso_currencies)
   - Check for contradictions with existing facts
   - Set status to 'pending' if contradicts, 'verified' otherwise
   - Return fact_id

3. **`sp_upsert_company_details(p_entity_id, p_details_json)`**
   - Upsert to `company_details` table
   - Validate legal_form against picklist
   - Validate country_code against iso_countries

4. **`sp_add_entity_identifier(p_entity_id, p_namespace, p_value, p_is_primary)`**
   - Check namespace exists
   - Validate pattern if defined
   - Insert to `entity_identifiers`

5. **`sp_classify_company(p_entity_id, p_code_system_id, p_code, p_role, p_confidence)`**
   - Validate code exists in taxonomy_nodes
   - Insert to `company_industries`
   - Mark as primary if no existing primary

#### Implementation Tasks:
- [ ] Write SQL for each procedure
- [ ] Add comprehensive error handling
- [ ] Add validation triggers
- [ ] Update coordinator to call procedures instead of direct inserts
- [ ] Add integration tests

### C.2 Materialized Views for Performance (Days 6-8)

**Rationale:** Complex joins for common queries (e.g., company profiles, latest financials) should be pre-computed.

#### Views to Create:

1. **`latest_financials_view`**
   ```sql
   SELECT entity_id, 
          MAX(period_end) as latest_period,
          array_agg(fact) FILTER (WHERE predicate = 'revenue') as revenue_facts,
          array_agg(fact) FILTER (WHERE predicate = 'employees') as employee_facts
   FROM facts
   WHERE predicate IN ('revenue', 'employees', 'profit', 'assets')
   GROUP BY entity_id;
   ```

2. **`company_profile_view`**
   ```sql
   SELECT e.id, e.legal_name, cd.legal_form, cd.status, cd.country_code,
          json_agg(DISTINCT ei.*) as identifiers,
          json_agg(DISTINCT ea.*) FILTER (WHERE ea.is_hq) as headquarters,
          json_agg(DISTINCT ci.*) FILTER (WHERE ci.role = 'primary') as primary_industries
   FROM entities e
   LEFT JOIN company_details cd ON cd.entity_id = e.id
   LEFT JOIN entity_identifiers ei ON ei.entity_id = e.id
   LEFT JOIN entity_addresses ea ON ea.entity_id = e.id
   LEFT JOIN company_industries ci ON ci.entity_id = e.id
   GROUP BY e.id, cd.*;
   ```

3. **`fact_audit_view`**
   ```sql
   SELECT f.id, f.subject, f.predicate, f.object,
          d.title as evidence_document,
          f.evidence_span_start, f.evidence_span_end,
          f.confidence, f.status, f.created_at
   FROM facts f
   LEFT JOIN documents d ON d.id = f.evidence_doc_id
   ORDER BY f.created_at DESC;
   ```

#### Implementation Tasks:
- [ ] Create materialized views with indexes
- [ ] Set up refresh strategy (on-demand vs scheduled)
- [ ] Update UI components to query views instead of base tables
- [ ] Add refresh triggers on fact/entity inserts

### C.3 Migration Data from JSONB to Structured Tables (Days 9-10)

**Rationale:** Existing `entities.identifiers` and `entities.metadata` are JSONB. Migrate to structured tables.

#### Migration Script:
```sql
-- Migrate identifiers from entities.identifiers JSONB to entity_identifiers table
INSERT INTO entity_identifiers (entity_id, namespace, value, is_primary)
SELECT 
  e.id,
  key as namespace,
  value as value,
  false as is_primary
FROM entities e, jsonb_each_text(e.identifiers)
WHERE e.identifiers IS NOT NULL
ON CONFLICT DO NOTHING;

-- Migrate addresses from entities.addresses JSONB to entity_addresses table
INSERT INTO entity_addresses (entity_id, is_hq, address_line1, locality, postal_code, country_code)
SELECT 
  e.id,
  (addr->>'is_hq')::boolean,
  addr->>'address_line1',
  addr->>'locality',
  addr->>'postal_code',
  addr->>'country_code'
FROM entities e, jsonb_array_elements(e.addresses) addr
WHERE e.addresses IS NOT NULL;
```

#### Implementation Tasks:
- [ ] Write migration script
- [ ] Test on dev environment
- [ ] Run migration in production
- [ ] Update UI to use structured tables
- [ ] Deprecate JSONB columns (keep for rollback safety)

---

## Phase D: Offerings System (9 days)

**Goal:** Add products/services schema for company offerings with attributes and classifications.

### D.1 Offerings Tables (Days 1-4)

```sql
CREATE TABLE offerings (
  offering_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  offering_type TEXT NOT NULL CHECK (offering_type IN ('product', 'service')),
  name TEXT NOT NULL,
  description TEXT,
  hs_code TEXT, -- Harmonized System code for goods
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE offering_classifications (
  offering_id UUID NOT NULL REFERENCES offerings(offering_id) ON DELETE CASCADE,
  code_system_id UUID NOT NULL REFERENCES code_systems(code_system_id),
  code TEXT NOT NULL,
  confidence NUMERIC(3,2),
  PRIMARY KEY (offering_id, code_system_id, code)
);

CREATE TABLE attribute_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT NOT NULL UNIQUE,
  value_type TEXT NOT NULL CHECK (value_type IN ('text', 'number', 'boolean', 'date')),
  unit_id UUID REFERENCES units(unit_id)
);

CREATE TABLE units (
  unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE offering_attributes (
  offering_id UUID NOT NULL REFERENCES offerings(offering_id) ON DELETE CASCADE,
  key_id UUID NOT NULL REFERENCES attribute_keys(key_id),
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_date DATE,
  as_of DATE,
  evidence_doc_id UUID REFERENCES documents(id),
  PRIMARY KEY (offering_id, key_id)
);
```

### D.2 CPC & HS Code Systems (Days 5-7)
- Seed CPC (Central Product Classification) top-level sections
- Seed HS (Harmonized System) chapters for goods
- Create crosswalks between ISIC ↔ CPC ↔ HS

### D.3 Update Research Agent (Days 8-9)
- Add product/service extraction to research-agent prompt
- Extract offerings with classifications
- Store via new stored procedures

---

## Phase E: Financials & Relationships (7 days)

**Goal:** Add financial statements, ownership structures, and stock listings.

### E.1 Financials Tables (Days 1-3)

```sql
CREATE TABLE company_financials (
  financial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('annual', 'quarterly', 'monthly')),
  currency_code CHAR(3) NOT NULL REFERENCES iso_currencies(code),
  revenue NUMERIC,
  operating_income NUMERIC,
  net_income NUMERIC,
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  equity NUMERIC,
  evidence_doc_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, period_end, period_type)
);
```

### E.2 Ownership & Listings (Days 4-6)

```sql
CREATE TABLE ownership_edges (
  edge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_entity_id UUID NOT NULL REFERENCES entities(id),
  owned_entity_id UUID NOT NULL REFERENCES entities(id),
  ownership_pct NUMERIC(5,2) CHECK (ownership_pct >= 0 AND ownership_pct <= 100),
  ownership_type TEXT CHECK (ownership_type IN ('direct', 'indirect', 'beneficial')),
  as_of DATE,
  evidence_doc_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE security_listings (
  listing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  exchange_mic CHAR(4) NOT NULL, -- ISO 10383 Market Identifier Code
  ticker TEXT NOT NULL,
  isin CHAR(12),
  listed_from DATE,
  delisted_date DATE,
  UNIQUE (entity_id, exchange_mic, ticker)
);
```

### E.3 Update Agents (Day 7)
- Extract financial data from annual reports
- Extract ownership from filings
- Store via stored procedures

---

## Phase F: Polish & Operations (11 days)

### F.1 Admin Dashboard (Days 1-5)
- Taxonomy browser (navigate ltree hierarchy)
- Company profile editor (edit structured data)
- Fact approval workflow (resolve contradictions)
- Prompt version comparison (A/B test results)

### F.2 Re-Classification Triggers (Days 6-8)
- When new taxonomy nodes added, trigger re-classification of existing companies
- Use embeddings for semantic matching
- Generate change_requests for review

### F.3 Performance Tuning (Days 9-11)
- Optimize chunk embedding indexes
- Tune ltree queries
- Add covering indexes for common joins
- Benchmark materialized view refresh times

---

## Success Metrics

### Technical Metrics
- ✅ All tables have RLS policies
- ✅ Zero direct table writes (all via stored procedures)
- ⏳ Materialized views < 1s query time
- ⏳ Fact storage < 100ms per fact
- ⏳ Company profile load < 500ms

### Business Metrics
- ⏳ 1000+ companies classified with ISIC codes
- ⏳ 100+ products/services cataloged
- ⏳ 50+ financial statements ingested
- ⏳ 95%+ fact accuracy (verified by human review)
- ⏳ < 5% contradiction rate

---

## Timeline Summary

| Phase | Duration | Status | Completion Date |
|-------|----------|--------|----------------|
| Phase A: Foundation | 30 days | ✅ Complete | 2025-10-15 |
| Phase B: Core Schema | 14 days | ✅ Complete | 2025-10-30 |
| Phase C: Governance | 10 days | 🔄 Next | 2025-11-09 (est.) |
| Phase D: Offerings | 9 days | ⏳ Planned | 2025-11-18 (est.) |
| Phase E: Financials | 7 days | ⏳ Planned | 2025-11-25 (est.) |
| Phase F: Polish | 11 days | ⏳ Planned | 2025-12-06 (est.) |
| **Total** | **81 days** | **25% done** | **Target: 2025-12-06** |

---

## Next Steps (Immediate)

1. **Implement stored procedures** (Phase C.1) - Start with `sp_upsert_entity`
2. **Create company_profile_view** (Phase C.2) - Test with existing data
3. **Migrate JSONB data** (Phase C.3) - Run on dev first
4. **Update UI components** - Use structured tables instead of JSONB

---

## References

- **Vision Alignment**: See `philosophy_alignment_first_typed_core_vector_assisted_db.md`
- **Schema Details**: See `database_schema_alignment_first_typed_core_vector_assisted_v_1.md`
- **End Goal**: See `goal_self_updating_company_knowledge_graph.md`
- **Implementation**: See `IMPLEMENTATION_PLAN.md`
