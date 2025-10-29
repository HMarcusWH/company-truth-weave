# OpenAI Integration Guide for Company Intelligence Platform

## Overview

This guide documents OpenAI API integration patterns and best practices for implementing the multi-agent system in our Company Intelligence Platform. It consolidates insights from OpenAI's 2025 API documentation and Agents SDK.

---

## 1. Model Selection Strategy (2025)

### Available Models

| Model | Context Window | Best For | Cost | Speed |
|-------|----------------|----------|------|-------|
| **gpt-5** | 200K tokens | Complex reasoning, high accuracy | High | Slow |
| **gpt-5-mini** | 200K tokens | Balanced performance/cost | Medium | Medium |
| **gpt-5-nano** | 200K tokens | High-volume simple tasks | Low | Fast |
| **gpt-4.1** | 1M tokens | Long documents, deep reasoning | Very High | Slow |
| **gpt-4.1-mini** | 1M tokens | Long context with efficiency | Medium | Medium |
| **gpt-4.1-nano** | 1M tokens | Massive context, simple ops | Low | Fast |

### Recommendation for Our Agents

```typescript
const AGENT_MODEL_MAP = {
  'research-agent': 'gpt-4.1-mini',      // Needs long context for documents
  'resolver-agent': 'gpt-5-nano',        // Simple deduplication logic
  'writer-agent': 'gpt-5-mini',          // Structured output generation
  'critic-agent': 'gpt-5-mini',          // QA validation logic
  'arbiter-agent': 'gpt-5-nano',         // Policy rule application
  'embedding-agent': 'text-embedding-3-large' // Vector embeddings
};
```

**Key Parameters:**
- **GPT-5 and newer models**: Use `max_completion_tokens` (NOT `max_tokens`). Do NOT include `temperature` parameter (defaults to 1.0).
- **Legacy models (gpt-4o, gpt-4o-mini)**: Use `max_tokens` and support `temperature`.

---

## 2. API Authentication & Security

### Environment Variables (Edge Functions)

```typescript
// supabase/functions/[agent]/index.ts
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY not configured');
}
```

### Security Best Practices

1. **NEVER expose API keys client-side** - All OpenAI calls must be through Supabase Edge Functions
2. **Use environment variables** - Store keys in Supabase Secrets via the `add_secret` tool
3. **Validate JWT tokens** - Ensure edge functions check user authentication
4. **Rate limiting** - Implement per-user rate limits to prevent abuse

---

## 3. Function Calling for Structured Outputs

Function calling is critical for our agents to produce structured data (entities, facts, relationships) with schema validation.

### Pattern: Entity Extraction (Research Agent)

```typescript
// Edge Function: supabase/functions/research-agent/index.ts
const tools = [
  {
    type: "function",
    function: {
      name: "extract_entities",
      description: "Extract company entities, relationships, and facts from document text",
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                legal_name: { type: "string" },
                entity_type: { type: "string", enum: ["company", "person", "organization"] },
                identifiers: {
                  type: "object",
                  properties: {
                    lei: { type: "string" },
                    vat: { type: "string" },
                    registry_id: { type: "string" }
                  }
                },
                website: { type: "string" }
              },
              required: ["legal_name", "entity_type"],
              additionalProperties: false
            }
          },
          relationships: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from_entity: { type: "string" },
                relationship_type: { type: "string", enum: ["subsidiary", "parent", "officer", "partner"] },
                to_entity: { type: "string" },
                confidence: { type: "number", minimum: 0, maximum: 1 }
              },
              required: ["from_entity", "relationship_type", "to_entity"]
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
        required: ["entities", "facts"],
        additionalProperties: false
      }
    }
  }
];

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4.1-mini',
    messages: [
      { 
        role: 'system', 
        content: `You are an expert at extracting structured company intelligence from documents. 
                  Extract all entities, relationships, and facts with high precision.
                  Always include confidence scores (0.0-1.0) based on evidence strength.` 
      },
      { role: 'user', content: documentText }
    ],
    tools: tools,
    tool_choice: { type: "function", function: { name: "extract_entities" } },
    max_completion_tokens: 2000
  }),
});

const data = await response.json();
const toolCall = data.choices[0].message.tool_calls[0];
const extractedData = JSON.parse(toolCall.function.arguments);
// extractedData now contains { entities: [...], relationships: [...], facts: [...] }
```

### Pattern: Fact Validation (Critic Agent)

```typescript
const tools = [
  {
    type: "function",
    function: {
      name: "validate_fact",
      description: "Validate a fact for quality, consistency, and evidence",
      parameters: {
        type: "object",
        properties: {
          is_valid: { type: "boolean" },
          confidence_score: { type: "number", minimum: 0, maximum: 1 },
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                issue_type: { 
                  type: "string", 
                  enum: ["missing_evidence", "contradiction", "low_confidence", "invalid_format"] 
                },
                description: { type: "string" },
                severity: { type: "string", enum: ["critical", "warning", "info"] }
              },
              required: ["issue_type", "description", "severity"]
            }
          },
          recommendation: { 
            type: "string", 
            enum: ["approve", "quarantine", "reject"] 
          }
        },
        required: ["is_valid", "confidence_score", "recommendation"],
        additionalProperties: false
      }
    }
  }
];
```

---

## 4. Responses API (New 2025 Feature)

The **Responses API** is OpenAI's new event-driven API for tool use and state management. It's ideal for complex workflows but requires more setup than Chat Completions.

### When to Use Responses API vs Chat Completions

| Use Case | API Choice | Reason |
|----------|-----------|--------|
| Single-turn entity extraction | Chat Completions | Simpler, sufficient |
| Multi-step research with web search | Responses API | Built-in tools (web search) |
| Long-running background tasks | Responses API | Background mode support |
| Simple fact validation | Chat Completions | Stateless, fast |
| Complex orchestration with state | Responses API | Previous response tracking |

### Example: Research Agent with Web Search

```typescript
// If we need to fetch live company data from the web
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4.1',
    tools: [{ type: "web_search" }],
    input: `Find the latest financial reports for ${companyName}`,
    instructions: "Search the web for recent SEC filings and press releases"
  })
});

const data = await response.json();
console.log(data.output_text); // Final answer
console.log(data.steps); // Tool invocations and reasoning
```

---

## 5. Agents SDK for Multi-Agent Orchestration

The **OpenAI Agents SDK** (`openai-agents-python`) is a lightweight framework for building multi-agent systems with handoffs and guardrails.

### Installation (Python-only, Node.js coming soon)

```bash
pip install openai-agents
```

### Core Concepts

1. **Agent**: An LLM with instructions, tools, and handoffs
2. **Runner**: Executes agent workflows (sync or async)
3. **Tools**: Python functions decorated with `@function_tool`
4. **Handoffs**: Mechanism for agents to delegate tasks

### Example: Multi-Agent System

```python
from agents import Agent, Runner, function_tool

@function_tool
def search_company_database(company_name: str) -> dict:
    """Search internal database for company records"""
    # Query Supabase
    return {"entity_id": "123", "legal_name": company_name}

# Define specialized agents
research_agent = Agent(
    name="Research Agent",
    instructions="You extract company data from documents",
    tools=[search_company_database]
)

resolver_agent = Agent(
    name="Resolver Agent", 
    instructions="You deduplicate companies using identifiers"
)

writer_agent = Agent(
    name="Writer Agent",
    instructions="You safely write data to the database via stored procedures"
)

# Coordinator with handoffs
coordinator = Agent(
    name="Coordinator",
    instructions="Orchestrate research -> resolve -> write workflow",
    handoffs=[research_agent, resolver_agent, writer_agent]
)

# Execute workflow
result = Runner.run_sync(coordinator, "Process this press release: ...")
print(result.final_output)
```

**Note:** Since the Agents SDK is Python-only and we're using Deno/TypeScript for edge functions, we'll implement a **simplified coordinator pattern** in TypeScript instead.

---

## 6. Coordinator Pattern (TypeScript Implementation)

Since the official Agents SDK doesn't support Node.js/Deno yet, we'll implement our own coordinator in the edge functions.

### Pattern: Sequential Agent Execution

```typescript
// supabase/functions/coordinator/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { company_name, document_url } = await req.json();
    
    // STEP 1: Research Agent - Extract entities from document
    const researchResult = await supabase.functions.invoke('research-agent', {
      body: { document_url }
    });
    
    if (researchResult.error) throw new Error('Research agent failed');
    const { entities, facts } = researchResult.data;
    
    // STEP 2: Resolver Agent - Deduplicate entities
    const resolverResult = await supabase.functions.invoke('resolver-agent', {
      body: { candidate_entities: entities }
    });
    
    const { resolved_entity_ids } = resolverResult.data;
    
    // STEP 3: Writer Agent - Write to database via stored procedures
    const writerResult = await supabase.functions.invoke('writer-agent', {
      body: { entity_ids: resolved_entity_ids, facts }
    });
    
    // STEP 4: Embedding Agent - Generate vectors
    await supabase.functions.invoke('embedding-agent', {
      body: { document_url, entity_ids: resolved_entity_ids }
    });
    
    // STEP 5: Critic Agent - Validate facts
    const criticResult = await supabase.functions.invoke('critic-agent', {
      body: { fact_ids: writerResult.data.fact_ids }
    });
    
    // STEP 6: Arbiter Agent - Apply policy gates
    const arbiterResult = await supabase.functions.invoke('arbiter-agent', {
      body: { validation_results: criticResult.data }
    });
    
    return new Response(JSON.stringify({
      success: true,
      ingestion_run_id: writerResult.data.ingestion_run_id,
      facts_approved: arbiterResult.data.approved_count
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Coordinator error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

---

## 7. Embeddings for Vector Search

Use `text-embedding-3-large` or `text-embedding-3-small` for generating document embeddings.

### Pattern: Generate and Store Embeddings

```typescript
// supabase/functions/embedding-agent/index.ts
const response = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'text-embedding-3-large', // 3072 dimensions
    input: documentChunks, // Array of text chunks (max 8191 tokens each)
    encoding_format: 'float' // or 'base64'
  })
});

const data = await response.json();
const embeddings = data.data.map((item: any) => item.embedding);

// Store in Supabase with pgvector
for (let i = 0; i < embeddings.length; i++) {
  await supabase.from('doc_embeddings').insert({
    document_id: docId,
    chunk_index: i,
    embedding: embeddings[i], // pgvector column
    chunk_text: documentChunks[i]
  });
}
```

### Semantic Search Query

```sql
-- Find similar documents using cosine similarity
SELECT 
  document_id,
  chunk_text,
  1 - (embedding <=> '[query_embedding_vector]'::vector) AS similarity
FROM doc_embeddings
ORDER BY embedding <=> '[query_embedding_vector]'::vector
LIMIT 10;
```

---

## 8. Content Moderation

Use the **Moderation API** to detect harmful content before processing.

```typescript
const response = await fetch('https://api.openai.com/v1/moderations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'omni-moderation-latest',
    input: documentText
  })
});

const data = await response.json();
const result = data.results[0];

if (result.flagged) {
  console.log('Content flagged for:', Object.keys(result.categories).filter(cat => result.categories[cat]));
  // BLOCK or QUARANTINE
}
```

---

## 9. Error Handling & Retry Logic

### Pattern: Exponential Backoff

```typescript
async function callOpenAIWithRetry(payload: any, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 429) {
        // Rate limit - wait exponentially
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`Attempt ${attempt} failed, retrying...`);
    }
  }
}
```

---

## 10. Cost Optimization Strategies

### Token Counting

```typescript
// Estimate tokens (rough approximation: 1 token ≈ 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const promptTokens = estimateTokens(systemPrompt + userPrompt);
if (promptTokens > 100000) {
  console.warn('Prompt exceeds 100K tokens, consider chunking or using gpt-4.1');
}
```

### Model Selection Logic

```typescript
function selectModel(taskComplexity: 'simple' | 'medium' | 'complex', contextLength: number) {
  if (contextLength > 200000) {
    return taskComplexity === 'complex' ? 'gpt-4.1' : 'gpt-4.1-mini';
  }
  
  if (taskComplexity === 'simple') return 'gpt-5-nano';
  if (taskComplexity === 'medium') return 'gpt-5-mini';
  return 'gpt-5';
}
```

---

## 11. Testing & Validation

### Pattern: Deterministic Outputs for Testing

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-5-mini',
    messages: [...],
    seed: 42, // For reproducibility
    max_completion_tokens: 500
  })
});
```

### Pattern: Evaluation Framework

```typescript
// Test entity extraction accuracy
const testCases = [
  { input: "Apple Inc. (LEI: 549300K5W4YRQX2V3J97) announced...", expected_lei: "549300K5W4YRQX2V3J97" },
  // ... more test cases
];

for (const testCase of testCases) {
  const result = await extractEntities(testCase.input);
  const passed = result.entities[0].identifiers.lei === testCase.expected_lei;
  console.log(`Test ${passed ? 'PASSED' : 'FAILED'}: ${testCase.input.slice(0, 50)}...`);
}
```

---

## 12. Recommended Implementation Order

1. **Research Agent** (entity extraction via function calling) - `gpt-4.1-mini`
2. **Resolver Agent** (deduplication logic) - `gpt-5-nano`
3. **Writer Agent** (database writes via stored procedures) - `gpt-5-mini`
4. **Critic Agent** (fact validation) - `gpt-5-mini`
5. **Arbiter Agent** (policy gates) - `gpt-5-nano`
6. **Embedding Agent** (vector generation) - `text-embedding-3-large`
7. **Coordinator** (orchestration) - TypeScript edge function

---

## 13. References

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Agents SDK (Python)](https://github.com/openai/openai-agents-python)
- [Chat Completions API](https://platform.openai.com/docs/guides/text-generation)
- [Responses API (2025)](https://platform.openai.com/docs/guides/responses)
- [Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)

---

**Last Updated:** 2025-10-29  
**Version:** 1.0
