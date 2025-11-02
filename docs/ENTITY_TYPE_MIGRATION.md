# Entity Type Migration Plan

## Overview
Migrate from hardcoded `entity_type` enum to flexible taxonomy-backed entity classification, aligning with portable architecture blueprint.

---

## Phase 1: Emergency Fix (Deploy Today) 🚨

**Goal:** Make the pipeline work *right now* without breaking existing data

### Status: ✅ COMPLETE

### Changes Implemented:

**1A: Fix Coordinator's Entity Mapping Bug**
- **File:** `supabase/functions/coordinator/index.ts` (lines ~726-757)
- **Root Cause:** Coordinator hardcodes `entity_type: "other"` instead of preserving resolver-agent's output
- **Fix:** Use `entity.entity_type` directly from resolver-agent response with fallback to 'company'
- **No schema change needed** - purely a code bug

**1B: Fix Resolver-Agent Entity Type Preservation**
- **File:** `supabase/functions/resolver-agent/index.ts` (lines ~185-211)
- **Root Cause:** Resolver-agent was transforming `entity_type: "event"` to `entity_type: "other"` during normalization
- **Fix:** 
  - Removed "other" from entity_type enum, added "event"
  - Enhanced system prompt to explicitly instruct preservation of entity_type values
  - Added description to tool schema: "MUST be preserved exactly as received"
- **No schema change needed** - purely a code/prompt bug

### Expected Result:
- ✅ BrightBid press release → 10 entities stored with correct types
- ✅ 10 facts stored and visible in UI
- ✅ Pipeline completes in <60 seconds
- ✅ No database schema changes required

### Testing:
1. Re-upload BrightBid press release
2. Verify pipeline status: `success`
3. Check entities table: `SELECT id, legal_name, entity_type FROM entities ORDER BY created_at DESC LIMIT 10;`
4. Check facts table: `SELECT subject, predicate, object, confidence FROM facts ORDER BY created_at DESC LIMIT 10;`

---

## Phase 2: Expand Entity Types (Deploy This Week) 📈

**Goal:** Support immediate business needs without full taxonomy migration

### Status: PLANNED

### Changes Required:

**2.1: Add Core Missing Types to Enum**
```sql
-- Expand enum to support current use cases
ALTER TYPE entity_type ADD VALUE 'organization';  -- broader than company
ALTER TYPE entity_type ADD VALUE 'instrument';    -- securities
ALTER TYPE entity_type ADD VALUE 'project';       -- initiatives
```

**2.2: Update Research-Agent Tool Schema**
- **File:** `supabase/functions/research-agent/index.ts` (line 218)
- Expand enum to include new types
- Add descriptions for when to use each

**2.3: Create Entity Type Documentation**
```markdown
# Entity Type Usage Guide

- **company**: Legal entity with registration (e.g., BrightBid AB)
- **organization**: Non-commercial entity (NGO, foundation, govt)
- **person**: Individual human
- **product**: Physical or digital product
- **location**: Geographic place
- **event**: Time-bounded occurrence
- **instrument**: Financial security (stock, bond)
- **project**: Initiative or program
```

### Expected Result:
- ✅ Support 8+ entity types without major schema changes
- ✅ Research-agent can extract new types
- ✅ Clear documentation for when to use each type

---

## Phase 3: Taxonomy-First Architecture (Deploy Next Sprint) 🏗️

**Goal:** Align with blueprint's flexible, domain-extensible model

### Status: PLANNED

### 3.1: Database Migration

**Create Entity Kind Code System:**
```sql
-- 1. Create entity_kind code system
INSERT INTO code_systems (name, version, kind, publisher)
VALUES ('entity_kind', '1.0.0', 'classification', 'Internal');

-- 2. Populate with ALL types from blueprint
INSERT INTO taxonomy_nodes (code_system_id, code, label, level, description, metadata)
SELECT 
  cs.code_system_id,
  t.code,
  t.label,
  t.level,
  t.description,
  jsonb_build_object('domain', t.domain)
FROM code_systems cs
CROSS JOIN (VALUES
  -- Core (level 1)
  ('organization', 'Organization', 1, 'Legal or formal entity', 'core'),
  ('person', 'Person', 1, 'Individual human', 'core'),
  ('location', 'Location', 1, 'Geographic place', 'core'),
  ('instrument', 'Instrument', 1, 'Financial security', 'core'),
  ('event', 'Event', 1, 'Time-bounded occurrence', 'core'),
  ('taxonomy_node', 'Taxonomy Node', 1, 'Classification term', 'core'),
  ('project', 'Project', 1, 'Initiative or program', 'core'),
  
  -- Finance domain (level 2)
  ('company', 'Company', 2, 'Legal business entity', 'finance'),
  ('financial_period', 'Financial Period', 2, 'Reporting period', 'finance'),
  ('auditor_report', 'Auditor Report', 2, 'Audit opinion', 'finance'),
  ('share_class', 'Share Class', 2, 'Equity instrument class', 'finance'),
  
  -- Ownership domain (level 2)
  ('ownership_interest', 'Ownership Interest', 2, 'Equity stake', 'ownership'),
  ('control_interest', 'Control Interest', 2, 'Control stake', 'ownership'),
  ('trust', 'Trust', 2, 'Legal trust entity', 'ownership'),
  ('partnership', 'Partnership', 2, 'Partnership entity', 'ownership'),
  ('fund', 'Fund', 2, 'Investment fund', 'ownership'),
  
  -- Procurement domain (level 2)
  ('tender', 'Tender', 2, 'Procurement process', 'procurement'),
  ('lot', 'Lot', 2, 'Sub-competition', 'procurement'),
  ('award', 'Award', 2, 'Contract award', 'procurement'),
  ('contract', 'Contract', 2, 'Legal contract', 'procurement'),
  ('implementation', 'Implementation', 2, 'Delivery milestone', 'procurement'),
  
  -- Ledger domain (level 2)
  ('account', 'Account', 2, 'Chart of accounts entry', 'ledger'),
  ('journal', 'Journal', 2, 'Voucher', 'ledger'),
  ('posting', 'Posting', 2, 'Journal line', 'ledger'),
  ('cost_center', 'Cost Center', 2, 'Cost allocation unit', 'ledger'),
  ('counterparty', 'Counterparty', 2, 'Transaction party', 'ledger'),
  
  -- Press/IR domain (level 2)
  ('press_release', 'Press Release', 2, 'Official announcement', 'press'),
  ('article', 'Article', 2, 'News article', 'press'),
  ('publisher', 'Publisher', 2, 'Media organization', 'press'),
  
  -- Clinical/Research domain (level 2)
  ('trial', 'Trial', 2, 'Clinical trial', 'clinical'),
  ('trial_period', 'Trial Period', 2, 'Trial phase window', 'clinical'),
  ('endpoint_measure', 'Endpoint Measure', 2, 'Measurement definition', 'clinical'),
  ('adverse_event_class', 'Adverse Event Class', 2, 'AE classification', 'clinical'),
  ('registry_record', 'Registry Record', 2, 'Trial registry entry', 'clinical')
) AS t(code, label, level, description, domain)
WHERE cs.name = 'entity_kind';

-- 3. Convert entities table from enum to text with FK to taxonomy
ALTER TABLE entities 
  ALTER COLUMN entity_type TYPE text USING entity_type::text;

ALTER TABLE entities
  ADD CONSTRAINT entity_type_valid_taxonomy 
  CHECK (
    EXISTS (
      SELECT 1 FROM taxonomy_nodes tn
      JOIN code_systems cs ON cs.code_system_id = tn.code_system_id
      WHERE cs.name = 'entity_kind' AND tn.code = entity_type
    )
  );

-- 4. Drop old enum (after verifying migration)
DROP TYPE entity_type CASCADE;
```

### 3.2: Domain-Aware Entity Validation

**Stored Procedure:**
```sql
CREATE OR REPLACE FUNCTION get_valid_entity_types(
  p_domain text DEFAULT NULL
)
RETURNS TABLE(code text, label text, description text)
LANGUAGE SQL
STABLE
AS $$
  SELECT tn.code, tn.label, tn.description
  FROM taxonomy_nodes tn
  JOIN code_systems cs ON cs.code_system_id = tn.code_system_id
  WHERE cs.name = 'entity_kind'
    AND (p_domain IS NULL OR tn.metadata->>'domain' = p_domain)
  ORDER BY tn.level, tn.code;
$$;
```

### 3.3: Update Research-Agent to Use Taxonomy

**File:** `supabase/functions/research-agent/index.ts`

```typescript
// Fetch valid entity types from taxonomy
const { data: validEntityTypes } = await supabase
  .rpc('get_valid_entity_types', { p_domain: 'finance' });

const entityTypeEnum = validEntityTypes?.map(t => t.code) || [
  'company', 'person', 'product', 'location', 'event'
];

// Use in tool schema
tools: [{
  type: 'function',
  function: {
    name: 'extract_entities',
    parameters: {
      properties: {
        entities: {
          items: {
            properties: {
              entity_type: { 
                type: 'string', 
                enum: entityTypeEnum,
                description: 'Entity classification. See taxonomy for valid types.'
              }
            }
          }
        }
      }
    }
  }
}]
```

### 3.4: Create Entity Type Discovery Tool

**New Edge Function:** `supabase/functions/entity-taxonomy/index.ts`

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const url = new URL(req.url);
  const domain = url.searchParams.get('domain') || null;
  
  const { data, error } = await supabase
    .rpc('get_valid_entity_types', { p_domain: domain });
  
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ 
    entity_types: data,
    taxonomy_version: '1.0.0'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
```

### 3.5: Agent Orchestration Pattern

**Coordinator with Conditional Agent Tools:**
```typescript
// research-agent becomes a reusable tool with conditional entity types
const researchTool = {
  type: 'function',
  function: {
    name: 'extract_entities_from_document',
    description: 'Extract structured entities and facts from document text',
    parameters: {
      type: 'object',
      properties: {
        documentText: { type: 'string' },
        targetEntityTypes: { 
          type: 'array',
          items: { type: 'string' },
          description: 'Limit extraction to these entity types'
        }
      }
    }
  }
};

// Coordinator routes by document type
if (documentType === 'press_release') {
  targetTypes = ['company', 'person', 'event', 'product'];
} else if (documentType === 'financial_report') {
  targetTypes = ['company', 'financial_period', 'auditor_report'];
}
```

### 3.6: Deterministic Quality Gates

**Pattern from OpenAI examples:**
```typescript
// In coordinator after research-agent
const entityQualityCheck = await invokeAgentWithAuth(
  supabase,
  'entity-quality-checker',
  { entities: researchResult.entities },
  authHeader
);

// Gate: stop if quality too low
if (!entityQualityCheck.good_quality) {
  console.log('Entity quality too low, stopping pipeline');
  await updateRunStatus(runId, 'failed', 'Poor entity extraction quality');
  return new Response(JSON.stringify({
    status: 'failed',
    reason: 'entity_quality_gate_failed'
  }), { status: 422 });
}
```

### Expected Result:
- ✅ Entity types stored in taxonomy (not hardcoded enum)
- ✅ Domain-specific entity types supported
- ✅ Research-agent fetches valid types dynamically
- ✅ New domains can be added without migrations
- ✅ Agent orchestration with conditional flows
- ✅ Quality gates prevent bad data from reaching storage

---

## Success Metrics

### Phase 1 (Immediate):
- ✅ BrightBid press release processes successfully
- ✅ 10 entities + 10 facts stored
- ✅ Pipeline completes in <60s
- ✅ Facts visible in UI

### Phase 2 (This Week):
- ✅ Support 8+ entity types without schema changes
- ✅ Research-agent can extract new types (organization, instrument, project)
- ✅ Documentation for when to use each type

### Phase 3 (Next Sprint):
- ✅ Entity types stored in taxonomy (not hardcoded enum)
- ✅ Domain-specific entity types supported
- ✅ Research-agent fetches valid types dynamically
- ✅ New domains (procurement, clinical) can be added without migrations
- ✅ Agent orchestration with conditional flows
- ✅ Quality gates prevent bad data from reaching storage

---

## Migration Safety

- **Phase 1:** Zero risk - only fixes code bug
- **Phase 2:** Low risk - enum expansion is additive
- **Phase 3:** Medium risk - requires testing:
  1. Test taxonomy migration on staging
  2. Verify all existing entities still validate
  3. Ensure research-agent handles new types
  4. Rollback plan: restore enum from backup

---

## Alignment with Blueprint

This plan implements the portable architecture in stages:

- ✅ **Symbols are truth** - Entity types become taxonomy codes
- ✅ **Vectors for recall** - Taxonomy nodes get embeddings for search
- ✅ **Evidence-first** - Preserved through all phases
- ✅ **Governed writes** - Validation via stored procedures
- ✅ **Taxonomies first-class** - Entity types *are* taxonomy
- ✅ **Reclassification expected** - Can update taxonomy without breaking pipeline

---

## OpenAI Agents Pattern Integration

From provided examples, we'll implement:

1. **Agents as Tools** (`agents-as-tools.ts`):
   - Research-agent → `extract_entities_from_document` tool
   - Resolver-agent → `normalize_entities` tool
   - Critic-agent → `validate_entities` tool

2. **Deterministic Gates** (`deterministic.ts`):
   - Quality gates after each agent
   - Domain-match gates to route documents
   - Confidence thresholds to trigger re-extraction

3. **Forced Structured Output** (`forcing-tool-use.ts`):
   - All agents return typed schemas (already implemented)
   - Coordinator enforces tool usage (already implemented)
