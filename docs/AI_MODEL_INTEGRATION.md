# AI Model Integration Guide

> Comprehensive guide to AI integration in the Company Intelligence Platform

## Overview

This platform uses **Lovable AI** as the default AI gateway, with support for multiple models (Gemini 2.5, GPT-5). All AI interactions are abstracted through a model-agnostic caller that automatically handles API differences, parameter mapping, and error handling.

**Default Model:** `google/gemini-2.5-flash` (via Lovable AI)

---

## Table of Contents

1. [Lovable AI Gateway (Default)](#1-lovable-ai-gateway-default)
2. [Model Selection Strategy](#2-model-selection-strategy)
3. [Model-Agnostic AI Caller](#3-model-agnostic-ai-caller)
4. [Function Calling for Structured Outputs](#4-function-calling-for-structured-outputs)
5. [Agent-Specific Configurations](#5-agent-specific-configurations)
6. [Error Handling & Retry Logic](#6-error-handling--retry-logic)
7. [Cost Optimization](#7-cost-optimization)
8. [Testing & Validation](#8-testing--validation)

---

## 1. Lovable AI Gateway (Default)

### What is Lovable AI?

Lovable AI is a pre-configured AI gateway that provides access to multiple AI models without requiring API keys. It's **automatically available** in all Lovable Cloud projects.

**Key Benefits:**
- ✅ No API key management required
- ✅ Pre-configured in Supabase Edge Functions
- ✅ Supports both Gemini and GPT models
- ✅ Usage-based pricing with free tier

### Available Models

| Model | Best For | Context Window | Speed | Cost |
|-------|----------|----------------|-------|------|
| `google/gemini-2.5-flash` | **Default** - Balanced performance | 1M tokens | Fast | Low |
| `google/gemini-2.5-pro` | Complex reasoning + multimodal | 2M tokens | Medium | Medium |
| `google/gemini-2.5-flash-lite` | Simple tasks, high volume | 1M tokens | Very Fast | Very Low |
| `openai/gpt-5-mini` | Strong reasoning, low cost | 200K tokens | Fast | Medium |
| `openai/gpt-5` | Highest quality, complex tasks | 200K tokens | Slower | High |
| `openai/gpt-5-nano` | Speed optimization | 200K tokens | Very Fast | Low |

### Authentication

The `LOVABLE_API_KEY` secret is **automatically provisioned** - no manual setup required.

```typescript
// Edge function - API key is already available
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash", // Default model
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: userMessage }
    ]
  })
});
```

---

## 2. Model Selection Strategy

### Current Agent Mappings (Production)

| Agent | Model | Rationale |
|-------|-------|-----------|
| **research-agent** | `google/gemini-2.5-pro` | Top-tier extraction accuracy + large context |
| **resolver-agent** | `google/gemini-2.5-pro` | Advanced entity resolution and deduplication |
| **critic-agent** | `openai/gpt-5` | Superior reasoning for validation + contradiction detection |
| **arbiter-agent** | `openai/gpt-5` | Highest quality policy decisions (PII, compliance) |
| **coordinator** | `google/gemini-2.5-flash` | Fast orchestration + document chunking |

### When to Use Different Models

**Use `google/gemini-2.5-pro` when:**
- Document exceeds 100K tokens (long annual reports)
- Complex multimodal analysis required (images + text)
- Highest accuracy needed (financial data extraction)

**Use `google/gemini-2.5-flash-lite` when:**
- Simple classification tasks
- High-volume processing (>1000 docs/hour)
- Cost optimization is critical

**Use OpenAI GPT models when:**
- User specifically requests OpenAI
- Need specific OpenAI features (e.g., specific function calling behavior)
- Embedding generation (use `text-embedding-3-large`)

---

## 3. Model-Agnostic AI Caller

### Architecture

All agents call AI models through `supabase/functions/_shared/ai-caller.ts`, which:
1. Fetches model configuration from `model_configurations` table
2. Automatically maps parameters based on API version
3. Handles API-specific quirks (e.g., OpenAI Responses API vs Chat Completions)
4. Normalizes responses to a common format

### Usage Example

```typescript
import { callAI, parseAIResponse } from '../_shared/ai-caller.ts';

// Fetch model configuration (agent_definitions stores model name)
const { data: agentData } = await supabase
  .from('agent_definitions')
  .select('model, reasoning_effort')
  .eq('agent_name', 'research-agent')
  .single();

// Call AI (automatically handles API differences)
const response = await callAI(supabaseUrl, supabaseKey, {
  model: agentData.model, // e.g., "google/gemini-2.5-flash"
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: documentText }
  ],
  tools: extractEntitiesTools, // Optional function calling
  temperature: 0.3, // Automatically omitted if unsupported
  reasoning_effort: agentData.reasoning_effort // For reasoning models
});

// Parse response (normalizes across APIs)
const result = await parseAIResponse(response, agentData.api_version);
const extracted = result.choices[0].message.tool_calls[0].function.arguments;
```

### Parameter Mapping

The `ai-caller` automatically handles parameter differences:

| Parameter | Chat Completions | Responses API | Lovable AI (Gemini) |
|-----------|------------------|---------------|---------------------|
| `temperature` | ✅ Supported | ❌ Not supported | ✅ Supported |
| `seed` | ✅ Supported | ❌ Not supported | ✅ Supported |
| `max_tokens` | ✅ Supported | ❌ Use `max_completion_tokens` | ✅ Supported |
| `reasoning_effort` | ❌ N/A | ✅ Required for reasoning models | ❌ N/A |

**Critical:** The `ai-caller` checks `model_configurations.supports_temperature` and `supports_seed` before including these parameters.

---

## 4. Function Calling for Structured Outputs

All agents use **function calling** (also called "tool calling") to extract structured data instead of parsing JSON from text responses.

### Example: Research Agent Entity Extraction

```typescript
// Define extraction schema
const extractEntitiesTools = [
  {
    type: "function",
    function: {
      name: "extract_entities",
      description: "Extract company entities and facts from document text",
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                entity_type: { 
                  type: "string", 
                  enum: ["company", "person", "product", "location", "event"] 
                },
                aliases: { type: "array", items: { type: "string" } }
              },
              required: ["name", "entity_type"]
            }
          },
          facts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject: { type: "string" },
                predicate: { type: "string" },
                object: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                evidence_text: { type: "string" }
              },
              required: ["subject", "predicate", "object"]
            }
          }
        },
        required: ["entities", "facts"]
      }
    }
  }
];

// Call with tool_choice to force structured output
const response = await callAI(supabaseUrl, supabaseKey, {
  model: "google/gemini-2.5-flash",
  messages: [
    { role: "system", content: "Extract entities and facts from documents." },
    { role: "user", content: documentText }
  ],
  tools: extractEntitiesTools,
  tool_choice: { type: "function", function: { name: "extract_entities" } }
});

// Parse structured output
const result = await parseAIResponse(response);
const toolCall = result.choices[0].message.tool_calls[0];
const extracted = JSON.parse(toolCall.function.arguments);

console.log(extracted.entities); // [{ name: "Acme Corp", entity_type: "company", ... }]
console.log(extracted.facts); // [{ subject: "Acme Corp", predicate: "headquartered_in", ... }]
```

### Benefits of Function Calling

1. **Type Safety:** Schema validation ensures correct structure
2. **No Parsing Errors:** No need to handle malformed JSON from text
3. **Clear Semantics:** Explicit intent vs. "generate JSON text"
4. **Better Accuracy:** Models are optimized for function calling

---

## 5. Agent-Specific Configurations

### Research Agent

**Purpose:** Extract entities, relationships, facts from documents

**Model:** `google/gemini-2.5-flash`

**Configuration:**
```typescript
{
  model: "google/gemini-2.5-flash",
  temperature: 0.3, // Deterministic extraction
  max_tokens: 4096,
  tools: [extractEntitiesTools],
  tool_choice: { type: "function", function: { name: "extract_entities" } }
}
```

**System Prompt:**
```
You are a research analyst extracting structured intelligence from company documents.

Extract:
1. Entities: Companies, people, products, locations with aliases
2. Facts: Subject-predicate-object triples with evidence citations
3. Confidence scores (0.0-1.0) for each fact

Rules:
- Use ISO country codes for locations
- Include LEI/VAT/registry IDs when mentioned
- Cite evidence with exact text spans
- Flag uncertain extractions with low confidence
```

---

### Resolver Agent

**Purpose:** Deduplicate and normalize extracted entities

**Model:** `google/gemini-2.5-flash`

**Configuration:**
```typescript
{
  model: "google/gemini-2.5-flash",
  temperature: 0.1, // Very deterministic matching
  max_tokens: 2048
}
```

**System Prompt:**
```
You are a data resolver that normalizes entity references.

Given candidate entities, match them to existing entities in the knowledge graph.

Matching priority:
1. Exact identifier match (LEI, VAT, registry ID)
2. Fuzzy name match (>0.8 similarity)
3. Website/domain match
4. Create new entity if no match

Return normalized triples with canonical entity IDs.
```

---

### Critic Agent

**Purpose:** Validate facts for contradictions and citation quality

**Model:** `google/gemini-2.5-flash`

**Configuration:**
```typescript
{
  model: "google/gemini-2.5-flash",
  reasoning_effort: "low", // Fast validation
  max_completion_tokens: 2048,
  tools: [validateFactTools],
  tool_choice: { type: "function", function: { name: "validate_fact" } }
}
```

**Note:** For OpenAI Responses API models (e.g., `gpt-5-mini`, `o3-mini`), do NOT include `temperature` or `seed` parameters.

**System Prompt:**
```
You are a fact-checking critic validating extracted intelligence.

Check for:
1. Contradictions: Same subject+predicate, different objects
2. Citation quality: Evidence text supports the claim
3. Confidence calibration: Score matches evidence strength
4. Temporal consistency: Dates make sense

Flag issues with severity (low/medium/high).
```

---

### Arbiter Agent

**Purpose:** Apply policy gates (PII, IP, compliance)

**Model:** `google/gemini-2.5-flash`

**Configuration:**
```typescript
{
  model: "google/gemini-2.5-flash",
  temperature: 0.0, // Zero temperature for rule application
  max_tokens: 1024,
  tools: [applyPolicyTools],
  tool_choice: { type: "function", function: { name: "apply_policy" } }
}
```

**System Prompt:**
```
You are a policy arbiter making ALLOW/WARN/BLOCK decisions.

Apply these gates:
1. PII: Block if contains SSN, credit card, personal phone/email
2. IP: Warn if mentions patents, trade secrets, NDAs
3. Compliance: Block if violates data residency/retention rules
4. Citation: Block if confidence > 0.8 but no evidence_text

Return decision with reason.
```

---

## 6. Error Handling & Retry Logic

### Exponential Backoff

All agents use `retryWithBackoff()` in the coordinator to handle transient failures:

```typescript
async function retryWithBackoff(fn: () => Promise<any>, retries = 0): Promise<any> {
  const MAX_RETRIES = 3;
  
  try {
    return await fn();
  } catch (error: any) {
    // Rate limit or service error - retry
    if (retries < MAX_RETRIES && (error.status === 429 || error.status >= 500)) {
      const delay = Math.pow(2, retries) * 1000; // 1s, 2s, 4s
      console.log(`Retry ${retries + 1}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries + 1);
    }
    
    throw error;
  }
}
```

### Common Error Codes

| Status | Meaning | Action |
|--------|---------|--------|
| 400 | Invalid request (bad parameters) | Check `ai-caller` parameter mapping |
| 401 | Unauthorized (bad API key) | Verify `LOVABLE_API_KEY` is set |
| 429 | Rate limit exceeded | Exponential backoff + retry |
| 500 | Server error | Retry with backoff |
| 503 | Service unavailable | Retry with backoff |

---

## 7. Cost Optimization

### Current Costs (Lovable AI)

Lovable AI uses **usage-based pricing** with a free tier. Costs are calculated per request.

**Typical Request Costs:**
- Research agent (2K tokens): ~$0.002
- Critic agent (1K tokens): ~$0.001
- Full pipeline (5 agents): ~$0.01 per document

### Optimization Strategies

1. **Use `google/gemini-2.5-flash-lite` for simple tasks** (50% cheaper)
2. **Cache system prompts** (reduces input tokens)
3. **Batch processing** (process multiple docs in parallel)
4. **Model routing** (use cheaper models for low-complexity tasks)

### Cost Tracking

Monitor usage via Lovable dashboard: Settings → Workspace → Usage

---

## 8. Testing & Validation

### Reproducible Outputs

Use the `seed` parameter for deterministic outputs (when supported):

```typescript
const response = await callAI(supabaseUrl, supabaseKey, {
  model: "google/gemini-2.5-flash",
  messages: [...],
  seed: 42, // Same input + seed = same output
  temperature: 0.3
});
```

**Note:** `seed` is NOT supported by OpenAI Responses API models.

### Evaluation Framework

Test entity extraction accuracy:

```typescript
const testCases = [
  {
    input: "Apple Inc. (NASDAQ: AAPL) reported Q4 revenue of $89.5B...",
    expected: {
      entities: [{ name: "Apple Inc.", entity_type: "company", identifiers: ["NASDAQ:AAPL"] }],
      facts: [{ subject: "Apple Inc.", predicate: "reported_revenue", object: "$89.5B" }]
    }
  },
  // ... more test cases
];

for (const test of testCases) {
  const result = await researchAgent.extract(test.input);
  assert.deepEqual(result.entities, test.expected.entities);
  assert.deepEqual(result.facts, test.expected.facts);
}
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. "Unsupported parameter: temperature" (400 Bad Request)

**Cause:** Using `temperature` or `seed` with OpenAI Responses API models (`gpt-5`, `gpt-5-mini`, `o3-mini`)

**Solution:** 
- Remove `temperature` and `seed` parameters for Responses API models
- The `ai-caller.ts` automatically filters these (lines 151-153, 197-206)
- Use `reasoning_effort` instead for o-series models

```typescript
// ❌ WRONG - Responses API doesn't support these
{
  model: "gpt-5",
  temperature: 0.1,
  seed: 42
}

// ✅ CORRECT
{
  model: "gpt-5",
  reasoning_effort: "medium"
}
```

#### 2. Rate Limit Exceeded (429)

**Cause:** Too many requests per minute to Lovable AI

**Solution:** Implemented in `coordinator/index.ts` with exponential backoff
- Automatically retries with 1s, 2s, 4s delays
- Check usage: Settings → Workspace → Usage
- Consider upgrading plan or batching requests

#### 3. "Function call returned invalid JSON"

**Cause:** Model didn't follow function calling schema

**Solution:**
- Improve system prompt clarity
- Use `tool_choice` to force function use
- Add schema validation examples in prompt
- Switch to more capable model (e.g., `gpt-5` instead of `gpt-5-nano`)

#### 4. Arbiter Agent Not Invoked

**Symptoms:** Pipeline completes but no arbiter decision logged

**Root Cause:** Parameter incompatibility with Responses API

**Fix Applied (2025-10-30):**
- Removed unsupported `temperature` and `seed` from `arbiter-agent/index.ts`
- Enhanced error logging in `coordinator/index.ts`
- Added response validation for malformed arbiter outputs

**Verification:**
```sql
-- Check arbiter node runs
SELECT node_id, status_code, outputs_json->>'decision'
FROM node_runs 
WHERE node_id = 'arbiter-agent'
ORDER BY created_at DESC LIMIT 5;
```

---

## Migration from Direct OpenAI Integration

If migrating from direct OpenAI API calls:

1. **Replace direct API calls** with `callAI()` from `ai-caller.ts`
2. **Update model names** to Lovable AI format (e.g., `gpt-4.1-mini` → `google/gemini-2.5-flash`)
3. **Remove API key management** (handled automatically)
4. **Keep function calling schemas** (same format across APIs)

**Before:**
```typescript
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
  body: JSON.stringify({ model: "gpt-4.1-mini", messages, tools })
});
```

**After:**
```typescript
const response = await callAI(supabaseUrl, supabaseKey, {
  model: "google/gemini-2.5-flash",
  messages,
  tools
});
```

---

## Troubleshooting

### Issue: "Unsupported parameter 'temperature'"

**Cause:** Using OpenAI Responses API model (e.g., `gpt-5-mini`) with `temperature` parameter

**Fix:** Update `model_configurations` table:
```sql
UPDATE model_configurations
SET supports_temperature = false, supports_seed = false
WHERE api_version = 'responses';
```

The `ai-caller` will automatically omit these parameters.

---

### Issue: "Rate limit exceeded"

**Cause:** Too many requests in short time window

**Fix:** Coordinator already implements retry logic. If persistent:
1. Check rate limit tier in Lovable dashboard
2. Add delays between batch requests
3. Consider upgrading plan for higher limits

---

### Issue: "Function call returned invalid JSON"

**Cause:** Model generated malformed JSON in function arguments

**Fix:** Add explicit instructions in system prompt:
```
Return valid JSON only. Do not include markdown formatting or explanations.
```

---

## Related Documentation

- [Architecture Guide](../ARCHITECTURE.md) - System architecture overview
- [PromptOps Guide](./PROMPTOPS_GUIDE.md) - Prompt versioning and governance
- [OpenAI Integration Guide](./OPENAI_INTEGRATION_GUIDE.md) - Legacy OpenAI API documentation (deprecated)
- [Troubleshooting Guide](../TROUBLESHOOTING.md) - Common issues and solutions

---

## Appendix: Model Configuration Schema

**Table:** `model_configurations`

| Column | Type | Description |
|--------|------|-------------|
| `model_name` | text | Unique model identifier (e.g., `google/gemini-2.5-flash`) |
| `provider` | text | Provider name (`lovable`, `openai`, `anthropic`) |
| `api_endpoint` | text | Base API URL |
| `api_version` | text | `chat_completions`, `responses`, or `custom` |
| `supports_temperature` | boolean | Whether model supports temperature parameter |
| `supports_seed` | boolean | Whether model supports seed parameter |
| `supports_function_calling` | boolean | Whether model supports function calling |
| `max_context_tokens` | integer | Maximum context window size |
| `default_temperature` | float | Default temperature value |
| `default_max_tokens` | integer | Default max tokens value |

Example row:
```sql
INSERT INTO model_configurations VALUES (
  'google/gemini-2.5-flash',
  'lovable',
  'https://ai.gateway.lovable.dev/v1/chat/completions',
  'chat_completions',
  true, -- supports_temperature
  true, -- supports_seed
  true, -- supports_function_calling
  1000000, -- 1M token context
  1.0, -- default_temperature
  4096 -- default_max_tokens
);
```
