# Troubleshooting Guide - Company Truth Weave

## Table of Contents
1. [Known Issues (Resolved)](#known-issues-resolved)
2. [Common Error Patterns](#common-error-patterns)
3. [Debugging Tools](#debugging-tools)
4. [Performance Issues](#performance-issues)
5. [Data Quality Issues](#data-quality-issues)

---

## Known Issues (Resolved)

### ❌ Critic-Agent Failing with "Unknown parameter: seed"
**Status**: ✅ FIXED (2025-10-30)

**Symptoms**:
- Critic-agent returns 400 errors from OpenAI
- Error message: `"Unknown parameter: seed"` or `"Unknown parameter: temperature"`
- 0% success rate for critic-agent executions
- Runs stuck at "partial" or "failed" status

**Root Cause**:
OpenAI Responses API models (`gpt-5-mini`, `o3-mini`) do NOT support `temperature` or `seed` parameters. These models use `reasoning_effort` for deterministic control instead.

**Solution**:
Only pass `reasoning_effort` to Responses API models. The `ai-caller.ts` abstraction layer now correctly filters parameters based on `model_configurations.api_version`.

**Code Fix** (supabase/functions/critic-agent/index.ts):
```typescript
// ❌ BEFORE (causes 400 error)
const response = await callAI(supabaseUrl, supabaseKey, {
  model: agentData.model,
  messages,
  reasoning_effort: agentData.reasoning_effort || 'low',
  temperature: 0.1,  // NOT SUPPORTED
  seed: 42           // NOT SUPPORTED
});

// ✅ AFTER (works correctly)
const response = await callAI(supabaseUrl, supabaseKey, {
  model: agentData.model,
  messages,
  reasoning_effort: agentData.reasoning_effort || 'low'
  // temperature and seed removed
});
```

**Prevention**:
Always check `model_configurations.supports_temperature` and `model_configurations.supports_seed` before including these parameters.

---

### ❌ Runs Stuck at "running" Status
**Status**: ✅ FIXED (2025-10-30)

**Symptoms**:
- All workflow runs show "running" in UI indefinitely
- Runs never transition to "success", "partial", or "failed"
- Database query shows `status_code = 'running'` even after pipeline completes

**Root Cause**:
Coordinator error handling didn't update run status when agents failed catastrophically. The catch block logged errors but didn't mark runs as failed.

**Solution**:
Enhanced coordinator catch block to **always** update run status, even on uncaught exceptions.

**Code Fix** (supabase/functions/coordinator/index.ts):
```typescript
} catch (error: any) {
  console.error('Unexpected error in coordinator:', error);
  
  // CRITICAL: Always mark run as failed on catastrophic error
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Update the most recent running run
      const { data: runningRuns } = await supabase
        .from('runs')
        .select('run_id')
        .eq('status_code', 'running')
        .order('started_at', { ascending: false })
        .limit(1);
      
      if (runningRuns && runningRuns.length > 0) {
        await supabase
          .from('runs')
          .update({
            status_code: 'failed',
            ended_at: new Date().toISOString(),
            metrics_json: {
              error_message: error.message || 'Internal server error',
              stack_trace: error.stack
            }
          })
          .eq('run_id', runningRuns[0].run_id);
      }
    }
  } catch (updateError) {
    console.error('Failed to update run status:', updateError);
  }
  
  return new Response(...);
}
```

**Verification**:
```sql
-- Check for stuck runs (should be empty after fix)
SELECT run_id, started_at, 
       NOW() - started_at AS elapsed_time
FROM runs
WHERE status_code = 'running'
  AND started_at < NOW() - INTERVAL '2 minutes';
```

---

### ❌ Facts Browser Shows Wrong Status Colors
**Status**: ✅ FIXED (2025-10-30)

**Symptoms**:
- Facts display incorrect status badges
- Color coding doesn't match actual database values
- Status filter returns no results

**Root Cause**:
UI expected legacy status values (`admitted`, `quarantined`, `retracted`) but database now stores (`pending`, `verified`, `disputed`, `superseded`).

**Solution**:
Updated `FactsBrowser.tsx` to use correct database status values.

**Code Fix** (src/components/FactsBrowser.tsx):
```typescript
// Database stores: pending | verified | disputed | superseded
// Fixed mapping (2025-10-30)
const getStatusIcon = (status: string) => {
  switch (status) {
    case "verified":
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "pending":
      return <Clock className="h-4 w-4 text-warning" />;
    case "disputed":
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case "superseded":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Database className="h-4 w-4 text-muted-foreground" />;
  }
};
```

---

## Common Error Patterns

### 1. Agent Function Not Found
**Error Message**: `FunctionsRelayError: Function not found`

**Causes**:
- Edge function not deployed
- Function name typo in coordinator
- Function disabled in Supabase dashboard

**Solution**:
```bash
# Verify function exists
curl -X POST \
  https://yazvrhbehgjfhdgcbgsh.supabase.co/functions/v1/research-agent \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documentText": "test", "documentId": "test", "environment": "dev"}'

# Expected: 200 OK or validation error (NOT 404)
```

---

### 2. Rate Limit Exceeded
**Error Message**: `429 Too Many Requests` from OpenAI

**Causes**:
- Exceeded OpenAI rate limits (10K RPM for GPT-5 Mini)
- Too many concurrent coordinator runs

**Solution**:
Coordinator implements exponential backoff automatically (max 5 retries). If rate limits persist:
- Increase retry delay in coordinator (line 107)
- Use Lovable AI (Gemini) instead of OpenAI
- Request higher rate limits from OpenAI

---

### 3. Foreign Key Constraint Violation
**Error Message**: `violates foreign key constraint "fk_facts_evidence_doc"`

**Causes**:
- Trying to insert fact with non-existent `evidence_doc_id`
- Document was deleted but facts reference it

**Solution**:
Constraints use `ON DELETE SET NULL`, so this should be rare. If it occurs:
```sql
-- Find orphaned facts
SELECT f.id, f.subject, f.evidence_doc_id
FROM facts f
LEFT JOIN documents d ON f.evidence_doc_id = d.id
WHERE f.evidence_doc_id IS NOT NULL
  AND d.id IS NULL;

-- Fix: Set evidence_doc_id to NULL
UPDATE facts SET evidence_doc_id = NULL WHERE id IN (...);
```

---

## Debugging Tools

### 1. Check Agent Execution Logs

```sql
-- Query recent agent executions with errors
SELECT 
  nr.node_run_id,
  ad.agent_name,
  nr.status_code,
  nr.latency_ms,
  nr.error_message,
  nr.created_at
FROM node_runs nr
JOIN agent_definitions ad ON ad.agent_id = nr.agent_id
WHERE nr.created_at > NOW() - INTERVAL '1 hour'
ORDER BY nr.created_at DESC
LIMIT 20;
```

### 2. Verify Active Prompt Bindings

```sql
-- Check which prompt versions are active per agent
SELECT 
  pb.agent_id,
  ad.agent_name,
  pv.version_label,
  pv.state_code,
  pb.traffic_weight,
  pb.effective_from,
  pb.env_code
FROM prompt_bindings pb
JOIN agent_definitions ad ON ad.agent_id = pb.agent_id
JOIN prompt_versions pv ON pv.version_id = pb.version_id
WHERE pb.effective_to IS NULL
ORDER BY pb.agent_id, pb.env_code;
```

### 3. Monitor Pipeline Health

```sql
-- Get recent run success rates by status
SELECT 
  status_code,
  COUNT(*) as count,
  ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at))), 2) as avg_duration_seconds,
  ROUND(AVG((metrics_json->>'total_latency_ms')::numeric) / 1000, 2) as avg_latency_seconds
FROM runs
WHERE started_at > NOW() - INTERVAL '24 hours'
  AND ended_at IS NOT NULL
GROUP BY status_code
ORDER BY status_code;
```

### 4. Trace Individual Run

```sql
-- Full lineage for a specific run
SELECT 
  r.run_id,
  r.status_code as run_status,
  r.started_at,
  r.ended_at,
  nr.node_run_id,
  ad.agent_name,
  nr.status_code as agent_status,
  nr.latency_ms,
  nr.error_message
FROM runs r
LEFT JOIN node_runs nr ON nr.run_id = r.run_id
LEFT JOIN agent_definitions ad ON ad.agent_id = nr.agent_id
WHERE r.run_id = 'YOUR_RUN_ID_HERE'
ORDER BY nr.created_at;
```

### 5. Check Guardrail Results

```sql
-- Find policy violations in recent runs
SELECT 
  gr.result_id,
  r.run_id,
  r.started_at,
  gr.guardrail_name,
  gr.status_code,
  gr.details_json
FROM guardrail_results gr
JOIN runs r ON r.run_id = gr.run_id
WHERE gr.status_code IN ('warn', 'fail')
  AND r.started_at > NOW() - INTERVAL '24 hours'
ORDER BY r.started_at DESC;
```

---

## Performance Issues

### Slow Dashboard Queries

**Symptoms**:
- IngestionMonitor takes > 2 seconds to load
- FactsBrowser pagination is slow

**Diagnosis**:
```sql
-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT *
FROM facts f
JOIN documents d ON d.id = f.evidence_doc_id
WHERE f.status = 'verified'
ORDER BY f.created_at DESC
LIMIT 50;

-- Look for "Seq Scan" (bad) vs "Index Scan" (good)
```

**Solution**:
Indexes were added in migration `20251030020951_360664d5-fa07-4378-9457-5027d85baa10.sql`:
- `idx_node_runs_run_id`
- `idx_prompt_bindings_active`
- `idx_facts_evidence_doc_id`
- `idx_facts_status`
- `idx_runs_status_started`

If still slow, add composite indexes:
```sql
CREATE INDEX idx_facts_status_created 
  ON facts(status, created_at DESC);
```

---

### High Agent Latency

**Symptoms**:
- Coordinator runs taking > 30 seconds
- Individual agents timing out

**Diagnosis**:
```sql
-- Find slowest agents
SELECT 
  ad.agent_name,
  COUNT(*) as executions,
  AVG(nr.latency_ms) as avg_latency_ms,
  MAX(nr.latency_ms) as max_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY nr.latency_ms) as p95_latency_ms
FROM node_runs nr
JOIN agent_definitions ad ON ad.agent_id = nr.agent_id
WHERE nr.created_at > NOW() - INTERVAL '24 hours'
GROUP BY ad.agent_name
ORDER BY avg_latency_ms DESC;
```

**Solutions**:
1. **Switch to faster model**: Use `gpt-5-nano` instead of `gpt-5-mini`
2. **Reduce token count**: Truncate document text to 10K tokens
3. **Enable caching**: Use OpenAI prompt caching for repeated prompts
4. **Increase timeout**: Adjust coordinator `MAX_LATENCY_MS` (line 29)

---

## Data Quality Issues

### Low Confidence Scores

**Symptoms**:
- Facts consistently have confidence < 0.7
- Many facts in "disputed" status

**Diagnosis**:
```sql
-- Analyze confidence score distribution
SELECT 
  CASE 
    WHEN confidence < 0.5 THEN '< 0.5'
    WHEN confidence < 0.7 THEN '0.5 - 0.7'
    WHEN confidence < 0.9 THEN '0.7 - 0.9'
    ELSE '>= 0.9'
  END as confidence_bucket,
  COUNT(*) as count,
  status
FROM facts
GROUP BY confidence_bucket, status
ORDER BY confidence_bucket, status;
```

**Solutions**:
1. **Improve source documents**: Use higher-quality press releases
2. **Tune extraction prompt**: Adjust Research Agent prompt for clarity
3. **Enable reasoning**: Use `reasoning_effort: 'high'` for Critic Agent
4. **Add human review**: Flag facts < 0.8 confidence for manual verification

---

### Missing Evidence Citations

**Symptoms**:
- Facts have null `evidence_text`
- Arbiter blocks facts due to missing citations

**Diagnosis**:
```sql
-- Find facts without evidence
SELECT 
  COUNT(*) as total_facts,
  SUM(CASE WHEN evidence_text IS NULL THEN 1 ELSE 0 END) as missing_evidence,
  ROUND(100.0 * SUM(CASE WHEN evidence_text IS NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as pct_missing
FROM facts;
```

**Solutions**:
1. **Enforce in Research Agent**: Update prompt to require citations
2. **Block in Critic**: Add validation rule to reject facts without evidence
3. **Backfill**: Run script to extract evidence from documents retroactively

---

## Getting Help

If issues persist after trying these solutions:

1. **Check Recent Logs**:
   - Supabase Dashboard → Edge Functions → Logs
   - Filter by function name and error level

2. **Review Changelog**: Check `CHANGELOG.md` for recent fixes

3. **Consult Architecture**: Review `ARCHITECTURE.md` for system design context

4. **Contact Support**: File issue with:
   - Run ID of failed execution
   - Agent logs from Supabase dashboard
   - Query results from debugging tools above
