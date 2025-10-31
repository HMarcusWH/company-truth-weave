# Addendum — Finance Coverage (Complete Periodized Financial Records)

> Applies to: **goal_self_updating_company_knowledge_graph.md**, **philosophy_alignment_first_typed_core_vector_assisted_db.md**, **database_schema_alignment_first_typed_core_vector_assisted_v_1.md**

## A) Goal addendum — “Finance & Periodization”

**Objective.**  
Maintain **complete, periodized financial records** for every company we track—covering Income Statement, Balance Sheet, Cash Flow, material Notes, and Auditor report—across at least the last **3–5 fiscal years** per entity.

**Scope (MVP).**
- Sources: Årsredovisning (PDF/HTML), Allabolag snapshots, iXBRL/ESEF where available.
- Coverage per period:  
  - Statements: IS, BS, CF (when present)  
  - Notes: capitalization policy (K2/K3), related parties, dividends, events after the reporting period, remuneration/employees (as counts/amounts), ownership/share data.  
  - Auditor: opinion class (clean/qualified/adverse/GC warning) and key remarks.
- Standards anchors: `standard ∈ {K2, K3, IFRS}` (per period); prefer **ESEF/IFRS taxonomy** tags if present.

**Success criteria.**
- ≥ 3 fiscal years per entity with **typed** line items, explicit `period_start`/`period_end`, `currency`, and `unit_scale`.
- Parent vs Group clearly separated via `scope ∈ {parent, group}`.
- Each value traceable to **source_doc + evidence span**.
- Zero silent overwrites: all updates are **append-only** with bitemporal history.

---

## B) Philosophy addendum — “Periods, Provenance, Standards”

1) **Periods are first-class.**  
   Every numeric financial fact must carry: `fiscal_year`, `period_start`, `period_end`, `scope`, `currency`, `unit_scale`. No vectors for numbers/codes—ever.

2) **Provenance is non-negotiable.**  
   Each line item and note fact stores `source_doc_id` and an `evidence_span` (page/line or bbox ref). Nothing enters the core without reproducible provenance.

3) **Standards before heuristics.**  
   When iXBRL/ESEF exists, we map line items to **IFRS taxonomy** keys. Otherwise we map Swedish labels → our normalized keys and mark `standard: K2|K3|IFRS` per period.

4) **Parent vs Group is explicit.**  
   Consolidated (group) and parent-only figures are distinct periods (`scope`), never merged.

5) **Append-only truth.**  
   We keep **bitemporal** history; computed views may rescale/aggregate, but raw entries remain unaltered.

---

## C) Database addendum — “Financials Spine (v1.1)”

> Replace any single wide “company_financials” table with the following **periodized** quartet. Fraud/scoring is out-of-scope here.

### 1) `financial_period`
- `financial_period_id` (pk)  
- `entity_id`  
- `scope` (`parent` | `group`)  
- `standard` (`K2` | `K3` | `IFRS`)  
- `fiscal_year` (int)  
- `period_start` (date), `period_end` (date)  
- `currency` (ISO 4217), `unit_scale` (e.g., “SEK_thousands”)  
- `audited` (bool), `auditor_opinion` (`clean`|`qualified`|`adverse`|`gc-warning`|null)  
- `source_doc_id`, `as_of` (timestamp), `ingested_at` (timestamp)

### 2) `financial_line_item`
- `line_item_id` (pk)  
- `financial_period_id` (fk)  
- `statement` (`IS`|`BS`|`CF`)  
- `taxonomy_key` (normalized or IFRS tag, e.g., `revenue`, `ebit`, `total_assets`)  
- `raw_label` (as printed in source)  
- `value_numeric` (decimal)  
- `confidence` (0–1)  
- `evidence_span` (json: page/line/bbox)  
- `source_doc_id` (fk)  
- `version_digest` (hash of parser/model)

> Common `taxonomy_key` seeds (extendable):  
`revenue`, `cogs`, `gross_profit`, `operating_expenses`, `ebit`, `net_finance`, `profit_before_tax`, `net_income`,  
`total_assets`, `cash_and_equivalents`, `accounts_receivable`, `inventories`, `intangible_assets`, `goodwill`,  
`equity_total`, `share_capital`, `retained_earnings`, `interest_bearing_debt_st`, `interest_bearing_debt_lt`,  
`operating_cf`, `investing_cf`, `financing_cf`.

### 3) `financial_note_fact`
- `note_fact_id` (pk)  
- `financial_period_id` (fk)  
- `category` (`capitalization_policy`|`related_party`|`dividends`|`events_after_reporting`|`remuneration`|`employees`|`share_changes`|`contingent_liability`|`impairment_test`)  
- `key` (short identifier, e.g., `dev_cost_capitalized`, `avg_headcount`)  
- `value_text` | `value_number` | `value_date` | `value_money_amount` + `value_money_ccy`  
- `evidence_span`, `source_doc_id`

### 4) `auditor_report`
- `report_id` (pk)  
- `entity_id` (fk)  
- `fiscal_year`  
- `auditor_name`, `firm`  
- `opinion` (`clean`|`qualified`|`adverse`|`gc-warning`)  
- `key_emphasis` (short text)  
- `remarks_text` (text)  
- `evidence_span`, `source_doc_id`

#### Views (read-only, no scoring yet)
- `vw_financial_statements` — normalized IS/BS/CF by `entity_id`, `fiscal_year`, `scope`.  
- `vw_financial_notes` — typed note facts per period.  
- `vw_auditor_summary` — opinion and key remarks per year.

#### Write contracts (for agents)
- `sp_upsert_financial_period(jsonb)`  
- `sp_upsert_financial_line_items(jsonb[])`  
- `sp_upsert_financial_note_fact(jsonb)`  
- `sp_upsert_auditor_report(jsonb)`

> Each proc enforces: valid period dates; `currency` & `unit_scale` present; allowed `taxonomy_key`; `source_doc_id` + `evidence_span` required.

---

## D) Ingestion workflow (no fraud layer)

1) **Discover & fetch**  
   - Pull Allabolag bokslut pages + linked ÅR PDFs. Prefer iXBRL/ESEF when present.

2) **Parse & normalize**  
   - Extract IS/BS/CF tables, `unit_scale`, `currency`, `fiscal_year`, `scope`.  
   - Map Swedish labels → `taxonomy_key` (or IFRS tags when available).  
   - Extract note facts (policy, dividends, headcount, events after reporting).  
   - Extract auditor opinion + remarks.

3) **Write to core** (via stored procedures)  
   - Create/merge `financial_period`.  
   - Batch-insert `financial_line_item`.  
   - Insert `financial_note_fact`.  
   - Insert `auditor_report`.

4) **QA/Completeness**  
   - Validate presence of IS+BS (CF optional per ÅRL/K2).  
   - Ensure at least N years per entity (target 3–5).  
   - Verify all entries have provenance and consistent units.

---

## E) Non-goals (for this addendum)
- No fraud/anomaly scoring, Beneish, or alerts (separate addendum).  
- No ownership/PEP expansions beyond what’s already in the core.

---

## F) Acceptance checklist (MVP ready)
- [ ] Tables and procs deployed (`financial_period`, `financial_line_item`, `financial_note_fact`, `auditor_report`).  
- [ ] At least 3 years ingested for a pilot set (e.g., 50 entities).  
- [ ] Views return consistent IS/BS/CF per `scope` with correct units and currency.  
- [ ] 100% of stored items carry `source_doc_id` + `evidence_span`.  
- [ ] Auditor opinions visible per year in `vw_auditor_summary`.  

