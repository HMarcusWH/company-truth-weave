# Company Intelligence Platform

> Multi-agent system for extracting, validating, and storing structured company intelligence from unstructured documents.

## Overview

This platform uses a **multi-agent architecture** with PromptOps governance to transform company documents (press releases, filings, web pages) into a validated knowledge graph. Each agent has a specific role, versioned prompts, and built-in quality gates.

### Key Features

- **Multi-Agent Pipeline**: Research → Resolver → Critic → Arbiter → Storage
- **PromptOps Layer**: Versioned prompts, A/B testing, canary deployments, semantic drift detection
- **Knowledge Graph**: Entities (companies, people, products) + Facts (relationships, attributes) with citations
- **Quality Assurance**: Contradiction detection, citation enforcement, policy gates (PII, IP, compliance)
- **Full Audit Trail**: Every extraction logged with inputs, outputs, metrics, and lineage

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Documents  │────▶│   Research   │────▶│  Resolver   │────▶│    Critic    │
│ (Ingest)    │     │    Agent     │     │    Agent    │     │    Agent     │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                           │                     │                    │
                           │                     │                    │
                           ▼                     ▼                    ▼
                    Extract Facts         Normalize         Validate
                    + Entities           to Schema        Contradictions
                           │                     │                    │
                           └─────────────────────┴────────────────────┘
                                             │
                                             ▼
                                    ┌──────────────┐
                                    │   Arbiter    │
                                    │    Agent     │
                                    └──────────────┘
                                             │
                                             ▼
                                    Policy Gates
                                    (PII/IP/Compliance)
                                             │
                                             ▼
                                    ┌──────────────┐
                                    │  Knowledge   │
                                    │    Graph     │
                                    └──────────────┘
```

### Agent Roles

| Agent | Purpose | Input | Output |
|-------|---------|-------|--------|
| **Research** | Extract entities + facts from raw text | Document text | Entities, facts with citations |
| **Resolver** | Normalize to canonical schema | Raw entities/facts | Standardized data |
| **Critic** | Validate consistency + citations | Normalized facts | Pass/fail + issues |
| **Arbiter** | Apply policy gates | Validated facts | Allow/block/warn |
| **Coordinator** | Orchestrate workflow | Document | Full pipeline result |

## Documentation

- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Architecture, phases, technical design
- **[PromptOps Guide](./docs/PROMPTOPS_GUIDE.md)** - Prompt versioning, A/B testing, governance
- **[OpenAI Integration](./docs/OPENAI_INTEGRATION_GUIDE.md)** - AI model configuration and best practices

## Quick Start

### Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Calling Agents

#### Option 1: Via Coordinator (Recommended)

Orchestrates the full pipeline with retry logic and quality gates:

```typescript
const { data, error } = await supabase.functions.invoke('coordinator', {
  body: {
    documentText: "Your document text here...",
    documentId: "uuid-of-document",
    environment: "dev"
  }
});
```

#### Option 2: Individual Agents

Call agents directly for specific tasks:

```typescript
// Extract facts from raw text
const research = await supabase.functions.invoke('research-agent', {
  body: { documentText, documentId, environment: "dev" }
});

// Validate facts for contradictions
const critic = await supabase.functions.invoke('critic-agent', {
  body: { documentId, environment: "dev" }
});

// Apply policy gates
const arbiter = await supabase.functions.invoke('arbiter-agent', {
  body: { facts, entities, environment: "dev" }
});
```

## Database Schema

### Core Tables

- **entities**: Companies, people, products with identifiers (LEI, DUNS, etc.)
- **documents**: Source documents with metadata and embeddings
- **facts**: Extracted statements with subject-predicate-object structure + citations
- **validation_results**: Critic agent output (contradictions, citation checks)

### PromptOps Tables

- **prompt_templates**: Base templates for agent prompts
- **prompt_versions**: Versioned prompt content (semver + state: draft/approved/retired)
- **prompt_bindings**: Active version per agent per environment (with traffic weights)
- **rollouts**: A/B test configurations
- **runs**: Execution records (workflow-level)
- **node_runs**: Individual agent executions (with inputs/outputs/metrics)
- **message_logs**: LLM conversation history per node run
- **guardrail_results**: Policy gate results (PII, IP, citations, etc.)

## Current Status

### ✅ Complete

- **Database Infrastructure** (24 tables)
  - Core data: entities, documents, facts, validation_results
  - PromptOps: templates, versions, bindings, rollouts
  - Observability: runs, node_runs, message_logs, guardrails
  - Governance: change_requests, approval_policies
  - Auth: profiles, user_roles with RLS

- **Multi-Agent Pipeline**
  - 5 deployed edge functions with full observability
  - Model-agnostic AI integration (Gemini 2.5 Flash, GPT-5 Mini)
  - Coordinator orchestration with retry logic
  - Budget enforcement (max 5 calls, 60s latency)

- **PromptOps Features**
  - Versioned prompts (semver + state management)
  - Environment-specific bindings (dev/staging/prod)
  - Traffic-weighted A/B testing
  - Full execution audit trail

- **Frontend Dashboard**
  - Authentication with role-based access
  - Pipeline test interface
  - Entity and document management
  - Facts browser with validation status
  - Real-time ingestion monitoring

### 🚧 In Progress

- Admin UI for prompt/agent management
- Vector search with pgvector
- Document storage integration
- Embedding generation pipeline

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn-ui
- **Backend**: Supabase (Postgres + Edge Functions)
- **AI**: Lovable AI (GPT-5, Gemini 2.5)
- **Build**: Vite

## Environment Variables

Automatically configured via Lovable Cloud:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## Development

```bash
# Run locally
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

Deploy via [Lovable](https://lovable.dev/projects/a68c4d93-b210-4a9a-898c-1b31e1e5b8da):

1. Click **Share** → **Publish**
2. Edge functions deploy automatically
3. Database migrations run on publish

## License

MIT
