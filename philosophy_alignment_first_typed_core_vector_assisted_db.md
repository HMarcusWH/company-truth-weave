# Database Philosophy — Alignment‑First, Typed‑Core, Vector‑Assisted

## TL;DR
We store **alignment answers**, not every exact number on Earth. The graph’s truth lives in **codes, numbers, dates, and edges**; **text + vectors** are used to *find* and *contextualize* that truth—not to replace it. Every datum carries **provenance, time semantics, status, and confidence**, so LLMs (and humans) can assemble safe, auditable answers.

---

## Why “alignment answers” (not “all exact answers”)
- **Stability vs. utility:** Some values change constantly (headcount, pricing). Chasing a single exact value is brittle; storing a typed, time‑stamped **range or last‑known** value with evidence keeps the KG useful and honest.
- **LLM alignment:** Models behave best when the database constrains them to **valid symbols** (codes, enums) and **typed fields** (numbers/dates). We let vectors help discovery, then snap the output to **governed types**.
- **Auditability:** Answers must be **explainable**: show the doc, the characters inside it, the time, and the policy that accepted it.

> **Principle:**
> **Symbols are truth; prose is context; vectors enable recall.**

---

## Data classes & canonical storage
1) **Identities & Codes** — *immutable or slow‑moving facts*
   - Examples: LEI, orgnr/CIK/ISIN, ISO country/currency, legal form, industry/product codes.
   - **Store as:** FKs to lookup tables (versioned where needed). **No vectors.**

2) **Measured Quantities** — *numeric facts with units and periods*
   - Examples: revenue, EBITDA, ownership %, employees.
   - **Store as:** NUMERIC/INT + currency/unit + `period_start/period_end` + `as_of`. Optional **ranges** where inherent uncertainty exists (e.g., employees).
   - **No vectors.**

3) **Classifications (Taxonomies)** — *hierarchical codes*
   - Examples: ISIC/NACE/NAICS (industry); CPC/UNSPSC/GPC (products/services).
   - **Store as:** code + system/version + crosswalks (`exact/broader/narrower/related`).
   - **Vectors only** on taxonomy **labels/synonyms/definitions** for discovery.

4) **Events & Relationships** — *edges with time*
   - Examples: funding rounds, acquisitions, board appointments, parent→subsidiary.
   - **Store as:** edges with `start_date/end_date`, typed attributes, evidence. **No vectors.**

5) **Claims & Narratives** — *free text from sources*
   - Examples: press‑release paragraphs, product pages, mission statements, news.
   - **Store as:** original **text**, chunked, with **embeddings** for retrieval. Link any extracted facts to **doc + span**.

6) **Derived Indicators & Views** — *materialized, reproducible results*
   - Examples: latest profile view, revenue CAGR, industry mix %. **Never** store as vectors; compute from typed base + rules.

---

## Time semantics & status model
- Every fact/classification includes:
  - `as_of` (observation time) and, where applicable, `period_start/period_end` (measurement interval).
  - `status`: `pending` → `verified` → `disputed` → `superseded`.
  - `confidence` ∈ [0,1].
  - `evidence_doc_id` + `evidence_span_start/end` (character offsets).
- **Alignment answer** at query time = the **best constrained value** given time filters, status policy, and confidence threshold.

---

## Vector policy
- **Allowed:** discovery over **long text** (document chunks; taxonomy labels/synonyms; offering descriptions). HNSW indexes; hybrid (BM25 + vector) ranking.
- **Forbidden:** identifiers, join keys, codes, numeric/date fields, statuses, currencies. (Vectors never represent truth.)
- **Pattern:** `text` (+ hash) ↔ `embedding`. Keep embeddings versioned per model/dimension.

---

## LLM working model (contracts, not vibes)
- **Tool contracts return symbols/numbers** (enums, codes, UUIDs, numbers/dates) with optional candidate lists.
- **Two‑step workflow:**
  1) **Suggest** (vectors + heuristics) → candidate codes/values with justifications.
  2) **Upsert via stored procedures** that validate types, ranges, crosswalks, and evidence.
- **Critic/Arbiter gate:** rejects bad confidences, missing spans, illegal codes, wrong periods.

---

## Storage recipes (when to use what)

| Concept | Storage | Vector? | Why |
|---|---|---:|---|
| Legal name | CITEXT (+trigram index) | No | Exact lookup w/ fuzzy search; stable identifier surface. |
| Aliases/AKA | TEXT[] | No | Short strings; vectors unnecessary. |
| LEI / orgnr / CIK / ISIN | (namespace FK, value) | No | Must be exact; used for joins to external data. |
| Country / Currency | ISO codes | No | Codes are ground truth for math & formatting. |
| Address | Structured fields (+ geocodes) | No | Normalization & dedupe; country‑specific formats. |
| Founded year | INT | No | Numeric filters/comparisons. |
| Employees | INT or **range** (lo/hi) + `as_of` | No | Volatile; range communicates uncertainty; analytics safe. |
| Company status | Picklist | No | Consistent filtering/logic. |
| Industry classification | Code (ISIC/NACE/NAICS) + `as_of` + evidence + confidence | No | Truth is the code; vectors only help find candidates. |
| Offering description | TEXT + embedding | **Yes** | Long text for discovery/similarity. |
| Offering classification | Code (CPC/UNSPSC/GPC) + evidence | No | Codes support pivots & rollups. |
| Offering attributes | Typed (number/boolean/code/date/money) | No | Analytics require types & units. |
| Ownership % | NUMERIC(5,2) + dates | No | Arithmetic & thresholds. |
| Ticker/Exchange | TEXT + picklist (MIC) | No | Exact symbols; integrations depend on them. |
| Financials (rev, EBITDA, …) | NUMERIC + currency + period | No | Aggregation; never a vector. |
| Facts (triples) | Subject, predicate (picklist), **typed value columns** + evidence spans | No | Validates LLM output and enables SQL. |
| Documents (body) | TEXT, chunked | Optional (on chunks) | For semantic retrieval only. |
| Taxonomy labels/synonyms | TEXT/JSONB + embedding | **Yes** | Improves candidate generation; code remains the truth. |

---

## Alignment patterns (examples)
- **Headcount:** store `employees_lo`, `employees_hi`, `as_of`, `source`; answer with range unless a verified exact number for the same `as_of` exists.
- **Revenue:** store exact NUMERIC + `currency`, `period_start/end`, evidence; present converted values via view logic (fx tables), never as stored vectors.
- **Headquarters location:** store country/region/city as codes/strings; maintain a single **HQ edge** with `start_date/end_date` transitions.
- **Industry:** pick a **primary** code + optional `share_pct` for secondary codes; crosswalk at read time if the client requests a different system.
- **Products:** keep **descriptions (text+embedding)** for discovery; persist **classifications** and **typed attributes** for analytics.
- **Rumors/news claims:** store as **claims** on documents; no fact unless verified; expose to models as context only.

---

## Re‑classification & freshness
- Re‑run classifications when:
  - taxonomy **version** changes,
  - `as_of` exceeds freshness thresholds,
  - confidence < policy floor,
  - conflicting new evidence arrives.
- Supersede facts; never destructive‑overwrite.

---

## Governance & safety
- **Zero‑trust writes:** agents write via stored procedures that enforce types, ranges, crosswalks, RLS.
- **PromptOps:** version/bind/rollout prompts; log every LLM turn; guardrail results stored.
- **Observability:** success rates, p95 latencies, stuck‑run detectors, FK violation alerts.

---

## Performance notes
- Hybrid search (BM25 + HNSW pgvector) on **documents** and **taxonomy nodes** only.
- Heavy queries served via **materialized views** (company_profile_view, latest_financials_view, industry_mix_view).
- Indices tuned for joins on codes, dates, and entity IDs; vectors isolated to retrieval tables.

---

## Non‑goals (initially)
- Real‑time quotes/prices; full XBRL ingestion (we store pointers first).
- Magical inference of private data; we align what’s public and evidence‑backed.

---

## Touchstone
If it must be **compared, aggregated, filtered, validated, or joined** → **store as a symbol/number/date**.
If it’s **meant to be read and searched** → **store as text (+ embedding)**.
If it’s **uncertain or volatile** → store the **range/last‑known** with **as_of, status, confidence, and evidence**.

