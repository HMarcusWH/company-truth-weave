# Goal — Self‑Updating Company Knowledge Graph

## One‑liner
Build a **typed, auditable, self‑updating knowledge graph of companies** that LLMs and apps can query like a stable API: **truth in codes/numbers/dates**, vectors only for **finding** text, with full evidence, governance, and re‑classification loops.

---

## What we’re building
- A **company brain** that continuously ingests public sources (filings, press releases, websites, news), extracts facts, **normalizes them into typed tables**, and **tracks provenance** (document + character spans + confidence).
- An **LLM‑friendly interface** exposing strict tool/JSON schemas so models return **picklists, codes, and numbers**—never hallucinated strings.
- A **taxonomy service** for industries and products/services with **versioned code systems** and **crosswalks**, plus embeddings for **discovery** (not storage).

---

## Core principles
1) **Truth is symbolic.** Store reality as **IDs, codes, numbers, dates, currencies**.
2) **Vectors are for recall, not truth.** Use embeddings for long text (docs, chunks, descriptions, taxonomy labels/synonyms) only to **find** candidates. Persist the result as typed values.
3) **Evidence‑first.** Every fact/classification carries **source doc + character spans + confidence + as_of**.
4) **Governed prompts & zero‑trust writes.** Multi‑agent pipeline with policy gates; agents write via **stored procedures**; prompts are versioned & auditable.
5) **Taxonomies are first‑class.** Maintain **ISIC/NACE/NAICS** (industry) and **CPC/UNSPSC/GPC** (products/services) as **versioned hierarchies with crosswalks** (SKOS‑like model).
6) **Reclassification is expected.** Trigger rechecks on **taxonomy updates**, **low confidence**, or **stale as_of**.

---

## Architecture at a glance
- **Ingestion:** fetch pages/docs → chunk → embed → store raw + chunks.
- **Agents:** Coordinator → Research → Resolver → Critic → Arbiter (policy gates & guardrails).
- **Storage (Postgres/Supabase):** entities, documents (+chunks/embeddings), facts (typed), taxonomies (+crosswalks/embeddings), offerings (+typed attributes), financials, ownership, listings, appointments.
- **PromptOps & Observability:** versioned prompts/bindings/rollouts; runs/node_runs/message_logs/guardrail_results; RLS + indexes + alerts.
- **APIs & Tools:** strict JSON Schemas for LLM tools and developer endpoints (typed responses with codes/IDs and evidence).

---

## Functional objectives
**Identity & structure**
- Canonical company identity (LEI + local registries), legal form, status, normalized addresses (countries/currencies via ISO).
- Ownership & control edges (corporate parents/subs; space for beneficial ownership).
- Listings (ISIN/ticker/exchange), people & appointments.

**Industries**
- Primary/secondary **industry codes** with share %, **as_of**, evidence, and confidence.
- **Crosswalks** among ISIC/NACE/NAICS.

**Products/Services**
- Company **offerings** with **free‑text descriptions + embeddings** for discovery.
- **Typed classifications** to CPC/UNSPSC/GPC (and optional HS/CPV) with evidence & confidence.
- **Typed attributes** (numbers with units, booleans, enums, dates, money).

**Financials**
- Periodized metrics (revenue, EBITDA, etc.) with **currency & period**; later: XBRL alignment.

**Documents**
- Store raw text + **chunks + embeddings** for semantic retrieval; keep **content hash** & metadata.

**Facts (triples)**
- Subject–predicate–object with **typed value columns** (number/date/money/%/code/country/entity_id), status (pending/verified/disputed/superseded), evidence spans, and confidence.

**APIs & LLM tools**
- **Strict JSON Schema / tool contracts**: list_picklist, search_taxonomy, get_company, get_facts, classify_company_industry, classify_offering, upsert_offering_attributes.
- All responses use **codes/IDs** and typed fields; models cannot invent enums.

**Ops & governance**
- Multi‑agent pipeline with policy gates. PromptOps (templates/versions/bindings/rollouts). Observability (runs/node_runs/message_logs/guardrail_results).
- Row‑level security (RLS), targeted indexes, alerting (success rates, p95 latencies, stuck runs).

---

## Data placement (what goes where)
- **Codes/picklists (FKs):** countries (ISO‑3166), currencies (ISO‑4217), legal forms, company status, identifier namespaces, industry/product codes → **lookup tables** (versioned where relevant).
- **Numbers/dates:** employees, revenue, EBITDA, ownership %, period dates, as_of → **typed numeric/date columns**.
- **Text (+ vectors):** document text & chunks, offering descriptions, taxonomy labels/synonyms → **text + embedding** (for search only).
- **Never vectors:** identifiers, codes, numeric metrics, dates, statuses, currencies.

---

## Success criteria
- **Fact gate pass‑rate ≥ 95%** (critic/arbiter).
- **Reproducible answers:** every returned fact resolves to a **doc + span**.
- **Classification coverage:** ≥ 90% of tracked companies have **primary industry** with confidence ≥ 0.8.
- **Latency:** p95 fact query < 300 ms (from materialized views), taxonomy search < 600 ms hybrid.
- **Drift safety:** Prompt rollouts gated; no production breakage from prompt changes.

---

## Out of scope (initially)
- Real‑time market pricing/quotes.
- Global completeness of crosswalks (accept incremental curation).
- Fully automated beneficial ownership (begin with structure to store it).

---

## Phased delivery
- **Phase A (seed & skeleton):** core schema; ISIC/NACE/NAICS + CPC/UNSPSC loaded; doc chunking + embeddings; hybrid search; baseline agents; typed facts.
- **Phase B (offerings):** offering classifications, typed attributes; admin tools for taxonomy edits; re‑classification triggers.
- **Phase C (finance & ownership):** financial tables populated; ownership edges; XBRL pointers.
- **Phase D (governance & SLOs):** PromptOps dashboards, alerts, drift checks; performance tuning.
- **Phase E (developer API):** stable, versioned OpenAPI; LLM tool bundle; rate limits & keys.

---

## The payoff
A **governed, LLM‑ready, auditable** company graph where apps (and models) can ask hard questions and get **coded, numeric, dated answers with citations**—using vectors only to **find** the right text, never to **be** the data.

