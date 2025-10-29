
# PromptOps Guide — Versioned, Observable Prompts for Multi‑Agent Systems (v1)

## Purpose
Establish prompts, flows, and deployments as **first‑class, versioned, queryable artifacts** so the system is auditable, safe to iterate, and easy to roll back.

## Design Principles
- **Immutable versions, label-based rollout.**
- **Separation of concerns:** template (what) vs version (how) vs binding (where) vs run (what happened).
- **Determined data via picklists** (code sets) for roles, modalities, environments, states — no hard DB enums required.
- **Observability everywhere:** store rendered prompt, variables, tool calls, model params, latency, and guardrail outcomes per node.
- **Zero‑trust:** only privileged editors modify prompts/bindings; agents read; runs are append‑only logs.

## Core Objects (high level)
- **Prompt Template** — Canonical prompt definition before versioning.
- **Prompt Version** — Immutable snapshot with semver, content hash, optional embedding for similarity/drift.
- **Prompt Partial** — Reusable fragments/macros (versioned) to assemble larger prompts.
- **Agent Definition** — Logical agent (Coordinator/Researcher/…) + model/tool limits.
- **Prompt Binding** — Deploy a prompt version to an agent in an environment with traffic weight (A/B/canary).
- **Workflow Template** — DAG of nodes mapping agents/prompts/tools; checkpointing rules.
- **Run / Node Run / Message Log / Guardrail Result** — Full lineage for audits.
- **Change Request / Approval Policy / Decision Record** — Governance and rollbacks.
- **Metrics** — Daily aggregates per prompt version for dashboards/alerts.

## Data Flow (overview)
1) Author/approve **Prompt Versions** →
2) **Bind** to agents in **env** (dev/staging/prod) with traffic weights →
3) Orchestrator loads the **active binding** for each node →
4) Execute; log **Node Run** (rendered prompt, vars, outputs, tools, model, latency) →
5) Record **Guardrail Results**; update **Metrics** →
6) Overseer monitors drift/regressions; propose **Change Requests** → approve → roll out.

## Labels & Rollouts
Use **binding groups (rollouts)** to manage multiple versions per agent+env with weights summing to 100. Keep previous rollouts to enable instant rollback by switching the active group.

## Required Picklists (seed via code_sets/code_values)
- `prompt_role_type`: system, user, tool
- `prompt_modality`: text, json
- `workflow_node_kind`: planner, researcher, solver, critic, arbiter, historian, tool
- `environment`: dev, staging, prod
- `model_family`: gpt-5, gpt-5-mini, gpt-5-nano, gpt-4.1, gpt-4.1-mini, text-embedding-3-large, gemini-2.5-flash
- `prompt_state`: draft, candidate, approved, retired
- `run_status`: success, error, timeout, blocked
- `node_status`: success, error, timeout
- `message_role`: system, user, assistant, tool
- `guardrail_status`: pass, warn, fail

## Oversight & Queries (examples)
- **Active bindings per env** (who is live, with which version & weight)
- **Incident trace**: run → node_run → rendered prompt → version → guardrail results → decision record
- **Drift detection**: nearest‑neighbors on `prompt_version.content_embedding`
- **Regression detection**: compare today’s contradiction/error vs trailing 7‑day average

## Security Model
- Editors (admins) can write **templates/versions/bindings/workflows**.
- Agents may **read prompts** and **append** to run logs.
- RLS policies gate table access; stored procedures optional for writes to governance tables.
- No secrets are stored in `content_text`; use runtime indirection tokens (e.g., `{{VAULT:...}}`).

## SLOs
- Prompt fetch p95 < 50 ms (cached).
- Run logging write p95 < 150 ms.
- Rollout switch to propagate in < 1 minute.
- Audit replay (time‑travel) available for last 90 days.

