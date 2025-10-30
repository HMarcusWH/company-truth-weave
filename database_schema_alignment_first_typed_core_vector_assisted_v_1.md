# Database Schema — Alignment‑First, Typed‑Core, Vector‑Assisted (v1)

> **Purpose.** This schema implements the “typed‑truth, vector‑assisted recall” philosophy: authoritative facts are stored as **codes, numbers, dates, and edges** with provenance; **text + embeddings** are only for search/discovery.
>
> **Scope.** Extends the existing `entities → documents → facts` core with industries, products/services, offerings, attributes, financials, ownership, listings, appointments, and taxonomies + crosswalks. Designed for Supabase/Postgres.

---

## 0) Conventions & Extensions
- **IDs:** UUID (generated via `gen_random_uuid()`).
- **Time:** use `timestamptz` for event/create/update; `date` for business periods.
- **Codes:** ISO‑3166 (countries), ISO‑4217 (currencies). Prefer lookup tables over ENUMs for evolving vocabularies.
- **Embeddings:** `vector(1536)` (tune dim as needed). Store **only** for long‑form text and taxonomy labels.
- **Provenance:** every fact/classification carries `evidence_doc_id` and (when from text) `evidence_span_start/end` character offsets.

```sql
-- Core extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;           -- fuzzy search
CREATE EXTENSION IF NOT EXISTS vector;            -- embeddings
CREATE EXTENSION IF NOT EXISTS ltree;             -- taxonomy paths
```

---

## 1) Identity & Lookups
```sql
-- Identifier namespaces (LEI, orgnr_se, SEC_CIK, ISIN, ticker_MIC,...)
CREATE TABLE identifier_namespaces (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

-- Countries & currencies (seed from ISO)
CREATE TABLE iso_countries (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE iso_currencies (
  code CHAR(3) PRIMARY KEY,
  name TEXT NOT NULL,
  minor_unit INT
);

-- Legal forms / Company status (curated picklists)
CREATE TABLE picklist_legal_form (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
CREATE TABLE picklist_company_status (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
```

---

## 2) Entities, Companies, Identifiers & Addresses
```sql
-- Existing 'entities' table assumed present (entity_type: company/person/location/product/event)
-- Add a company detail child for typed corporate fields
CREATE TABLE company_details (
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  legal_form TEXT REFERENCES picklist_legal_form(id),
  status TEXT REFERENCES picklist_company_status(id),
  founded_year INT,
  country_code CHAR(2) REFERENCES iso_countries(code),
  employees INT,
  size_band TEXT,                                 -- e.g., '1-10','11-50','50-200'
  primary_isic_code TEXT,                          -- FK to taxonomy_nodes later
  updated_at timestamptz DEFAULT now()
);

-- Identifiers (multi-namespace, deduped)
CREATE TABLE entity_identifiers (
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  namespace TEXT REFERENCES identifier_namespaces(id),
  value TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  PRIMARY KEY(entity_id, namespace, value)
);

-- Structured addresses (normalizable, geocodable)
CREATE TABLE entity_addresses (
  address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  is_hq BOOLEAN DEFAULT FALSE,
  address_line1 TEXT,
  address_line2 TEXT,
  locality TEXT,
  region TEXT,
  postal_code TEXT,
  country_code CHAR(2) REFERENCES iso_countries(code),
  lat NUMERIC,
  lon NUMERIC
);
```

**Indexes**
```sql
CREATE INDEX idx_entity_identifiers_ns ON entity_identifiers(namespace, value);
CREATE INDEX idx_entity_addresses_entity ON entity_addresses(entity_id);
```

---

## 3) Documents, Chunks & Embeddings (Recall only)
```sql
ALTER TABLE documents
  ADD COLUMN language TEXT,
  ADD COLUMN content_hash TEXT,
  ADD COLUMN source_type TEXT;            -- 'press_release','filing','web','news',...

CREATE TABLE document_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE document_chunk_embeddings (
  chunk_id UUID PRIMARY KEY REFERENCES document_chunks(chunk_id) ON DELETE CASCADE,
  embedding VECTOR(1536)
);
```

**Indexes**
```sql
CREATE INDEX idx_doc_chunks_doc_seq ON document_chunks(document_id, seq);
CREATE INDEX idx_doc_chunks_trgm ON document_chunks USING gin (text gin_trgm_ops);
```

---

## 4) Facts (Triples) with Typed Values & Evidence
```sql
-- Extends existing 'facts' with typed value columns & spans
ALTER TABLE facts
  ADD COLUMN evidence_span_start INT,
  ADD COLUMN evidence_span_end INT,
  ADD COLUMN value_text TEXT,
  ADD COLUMN value_number NUMERIC,
  ADD COLUMN value_pct NUMERIC(5,2),
  ADD COLUMN value_money_amount NUMERIC,
  ADD COLUMN value_money_ccy CHAR(3) REFERENCES iso_currencies(code),
  ADD COLUMN value_date DATE,
  ADD COLUMN value_country CHAR(2) REFERENCES iso_countries(code),
  ADD COLUMN value_code TEXT,
  ADD COLUMN value_entity_id UUID REFERENCES entities(id);
```

**Indexes**
```sql
CREATE INDEX idx_facts_status ON facts(status);
CREATE INDEX idx_facts_doc ON facts(evidence_doc_id);
```

---

## 5) Taxonomies (Industries & Products/Services) + Crosswalks
```sql
CREATE TABLE code_systems (
  code_system_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,            -- 'ISIC','NACE','NAICS','CPC','UNSPSC','GPC','HS','CPV'
  version TEXT NOT NULL,         -- 'Rev.4','2022','v2025-01',...
  kind TEXT CHECK (kind IN ('industry','product_service')) NOT NULL,
  locale TEXT DEFAULT 'en',
  UNIQUE(name, version)
);

CREATE TABLE taxonomy_nodes (
  node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_system_id UUID REFERENCES code_systems(code_system_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  parent_code TEXT,
  path LTREE,
  depth INT,
  synonyms JSONB DEFAULT '[]',
  attributes JSONB DEFAULT '{}',
  effective_from DATE,
  effective_to DATE,
  UNIQUE(code_system_id, code)
);

CREATE TABLE taxonomy_node_embeddings (
  node_id UUID PRIMARY KEY REFERENCES taxonomy_nodes(node_id) ON DELETE CASCADE,
  embedding VECTOR(1536)
);

CREATE TYPE xwalk_relation AS ENUM ('exact','broader','narrower','related');
CREATE TABLE taxonomy_crosswalks (
  from_system UUID REFERENCES code_systems(code_system_id) ON DELETE CASCADE,
  from_code TEXT,
  to_system UUID REFERENCES code_systems(code_system_id) ON DELETE CASCADE,
  to_code TEXT,
  relation xwalk_relation NOT NULL,
  source TEXT,
  PRIMARY KEY (from_system, from_code, to_system, to_code)
);
```

**Indexes**
```sql
CREATE INDEX idx_tax_nodes_system_code ON taxonomy_nodes(code_system_id, code);
CREATE INDEX idx_tax_nodes_path ON taxonomy_nodes USING gist(path);
CREATE INDEX idx_tax_nodes_syn_gin ON taxonomy_nodes USING gin (synonyms jsonb_path_ops);
```

---

## 6) Company ↔ Industry Classification (Typed)
```sql
CREATE TABLE company_industries (
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  code_system_id UUID REFERENCES code_systems(code_system_id), -- ISIC/NACE/NAICS
  code TEXT NOT NULL,
  role TEXT CHECK (role IN ('primary','secondary')) DEFAULT 'primary',
  share_pct NUMERIC(5,2),
  as_of DATE,
  evidence_doc_id UUID REFERENCES documents(id),
  confidence NUMERIC(3,2) CHECK (confidence>=0 AND confidence<=1),
  PRIMARY KEY (entity_id, code_system_id, code)
);
```

**Indexes**
```sql
CREATE INDEX idx_company_industry ON company_industries(entity_id, code_system_id, code);
```

---

## 7) Offerings (Products/Services), Classifications & Attributes
```sql
DO $$ BEGIN
  CREATE TYPE offering_kind AS ENUM ('product','service','bundle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE offerings (
  offering_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  kind offering_kind NOT NULL,
  name TEXT NOT NULL,
  lifecycle_status TEXT,                         -- picklist later
  created_at timestamptz DEFAULT now()
);

-- Long text + embedding for discovery
CREATE TABLE offering_descriptions (
  offering_id UUID PRIMARY KEY REFERENCES offerings(offering_id) ON DELETE CASCADE,
  description TEXT
);
CREATE TABLE offering_description_embeddings (
  offering_id UUID PRIMARY KEY REFERENCES offerings(offering_id) ON DELETE CASCADE,
  embedding VECTOR(1536)
);

-- Typed classifications to CPC/UNSPSC/GPC/...
CREATE TABLE offering_classifications (
  offering_id UUID REFERENCES offerings(offering_id) ON DELETE CASCADE,
  code_system_id UUID REFERENCES code_systems(code_system_id),
  code TEXT NOT NULL,
  as_of DATE,
  evidence_doc_id UUID REFERENCES documents(id),
  confidence NUMERIC(3,2) CHECK (confidence>=0 AND confidence<=1),
  PRIMARY KEY (offering_id, code_system_id, code)
);

-- Attribute vocabulary and units
CREATE TABLE attribute_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,                    -- 'power_watt','color','sla_hours'
  value_type TEXT CHECK (value_type IN ('text','number','boolean','code','date','money'))
);
CREATE TABLE units (
  unit_id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
CREATE TABLE attribute_key_units (
  key_id UUID REFERENCES attribute_keys(key_id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES units(unit_id) ON DELETE RESTRICT,
  PRIMARY KEY (key_id, unit_id)
);

-- Typed attribute values (no vectors)
CREATE TABLE offering_attributes (
  offering_id UUID REFERENCES offerings(offering_id) ON DELETE CASCADE,
  key_id UUID REFERENCES attribute_keys(key_id) ON DELETE RESTRICT,
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_code TEXT,
  value_date DATE,
  value_money_amount NUMERIC,
  value_money_ccy CHAR(3) REFERENCES iso_currencies(code),
  PRIMARY KEY (offering_id, key_id)
);
```

**Indexes**
```sql
CREATE INDEX idx_offering_class ON offering_classifications(offering_id, code_system_id, code);
CREATE INDEX idx_offering_attr ON offering_attributes(offering_id, key_id);
```

---

## 8) Financials, Ownership, Listings, Appointments (Typed)
```sql
CREATE TABLE company_financials (
  financial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  period_start DATE,
  period_end DATE,
  currency CHAR(3) REFERENCES iso_currencies(code),
  revenue NUMERIC,
  gross_profit NUMERIC,
  ebitda NUMERIC,
  net_income NUMERIC,
  assets NUMERIC,
  liabilities NUMERIC,
  operating_cash_flow NUMERIC,
  as_of DATE
);

CREATE TABLE ownership_edges (
  edge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  interest_type TEXT,                              -- picklist later
  pct NUMERIC(5,2) CHECK (pct >= 0 AND pct <= 100),
  start_date DATE,
  end_date DATE,
  evidence_doc_id UUID REFERENCES documents(id)
);

CREATE TABLE security_listings (
  listing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  exchange TEXT,                                    -- MIC picklist later
  ticker TEXT,
  currency CHAR(3) REFERENCES iso_currencies(code),
  isin TEXT,
  cusip TEXT,
  start_date DATE,
  end_date DATE
);

CREATE TABLE appointments (
  appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  company_entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  role TEXT,                                        -- picklist later
  start_date DATE,
  end_date DATE,
  evidence_doc_id UUID REFERENCES documents(id)
);
```

**Indexes**
```sql
CREATE INDEX idx_financials_period ON company_financials(entity_id, period_start, period_end);
CREATE INDEX idx_ownership_holder ON ownership_edges(holder_entity_id);
CREATE INDEX idx_ownership_target ON ownership_edges(target_entity_id);
CREATE INDEX idx_listings_entity ON security_listings(entity_id);
CREATE INDEX idx_appointments_company ON appointments(company_entity_id);
```

---

## 9) Views (Fast Answers)
```sql
-- Latest financial snapshot per entity (example)
CREATE MATERIALIZED VIEW latest_financials_view AS
SELECT DISTINCT ON (entity_id)
  entity_id, period_start, period_end, currency,
  revenue, ebitda, net_income, assets, liabilities, operating_cash_flow,
  as_of
FROM company_financials
ORDER BY entity_id, period_end DESC NULLS LAST;

-- Company profile (example; extend as needed)
CREATE MATERIALIZED VIEW company_profile_view AS
SELECT e.id AS entity_id,
       e.legal_name,
       cd.country_code,
       cd.employees,
       cd.primary_isic_code,
       lf.label AS legal_form,
       cs.label AS status
FROM entities e
LEFT JOIN company_details cd ON cd.entity_id = e.id
LEFT JOIN picklist_legal_form lf ON lf.id = cd.legal_form
LEFT JOIN picklist_company_status cs ON cs.id = cd.status
WHERE e.entity_type = 'company';
```

---

## 10) Stored Procedures (Zero‑Trust Writes)
> Agents never write raw tables directly. They call **stored procedures** that validate types, ranges, crosswalks, and evidence.

- `sp_upsert_entity(entity_payload JSONB)`
- `sp_upsert_company_details(entity_id UUID, details JSONB)`
- `sp_add_document_with_chunks(doc_meta JSONB, raw_text TEXT)`
- `sp_add_fact_typed(fact_payload JSONB)`
- `sp_classify_company_industry(entity_id UUID, candidates JSONB)`
- `sp_classify_offering(offering_id UUID, candidates JSONB)`
- `sp_upsert_offering_attribute(offering_id UUID, key TEXT, typed_value JSONB)`

Each proc enforces: valid codes, known code_system/version, numeric bounds, currency/country codes, evidence presence, and RLS.

---

## 11) RLS, Guardrails & Observability
- Enable RLS on all tables; implement `has_role()` helper and policies by role (`admin`, `moderator`, `user`, service roles for agents).
- Guardrail results logged per run/node; facts require passing critic/arbiter checks before `status = 'verified'`.
- **Indexes to watch:** joins on IDs/codes/dates; avoid embeddings in hot transactional paths.

---

## 12) Index Summary (quick reference)
- Entities/IDs: `idx_entity_identifiers_ns`, `idx_entity_addresses_entity`
- Documents: `idx_doc_chunks_doc_seq`, `idx_doc_chunks_trgm`
- Facts: `idx_facts_status`, `idx_facts_doc`
- Taxonomy: `idx_tax_nodes_system_code`, `idx_tax_nodes_path`, `idx_tax_nodes_syn_gin`
- Classification: `idx_company_industry`, `idx_offering_class`, `idx_offering_attr`
- Finance/Ownership: `idx_financials_period`, `idx_ownership_holder`, `idx_ownership_target`, `idx_listings_entity`, `idx_appointments_company`

---

## 13) Embedding Policy (Do/Don’t)
- **Do:** `document_chunk_embeddings`, `taxonomy_node_embeddings`, `offering_description_embeddings`.
- **Don’t:** identifiers, join keys, codes, numeric/date fields, statuses, currencies.

---

## 14) Migration Order (suggested)
1. Extensions & lookups
2. Taxonomy scaffolding (`code_systems`, `taxonomy_nodes`, embeddings, crosswalks)
3. Entities child tables (`company_details`, identifiers, addresses)
4. Documents, chunks, embeddings
5. Facts typed columns
6. Company/Offering classifications & attributes
7. Financials, ownership, listings, appointments
8. Views & indexes
9. RLS policies & stored procedures

---

## 15) Notes
- Treat ISIC as canonical for industry; crosswalk to NACE/NAICS.
- Treat CPC as backbone for products/services; overlay UNSPSC/GPC/HS/CPV as needed.
- Keep taxonomy versions and re‑classification triggers (low confidence, stale `as_of`, system version changes).
- Add XBRL pointers later (IFRS/US‑GAAP) without changing numeric storage.

> **Touchstone:** If it must be **compared, aggregated, filtered, validated, or joined** → **store as symbol/number/date**. If it’s **searched or read** → **text (+ embedding)**. Uncertain/volatile → **range/last‑known** with **as_of/status/confidence/evidence**.
