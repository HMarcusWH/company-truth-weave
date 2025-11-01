/**
 * Coordinator Edge Function
 * 
 * Orchestrates the multi-agent pipeline for document ingestion:
 * 1. Research Agent - Extract entities and facts from raw text
 * 2. Resolver Agent - Normalize and deduplicate data
 * 3. Critic Agent - Validate for contradictions and quality
 * 4. Arbiter Agent - Apply policy gates (PII, citations)
 * 5. Storage - Persist entities and facts to database
 * 
 * Features:
 * - Exponential backoff retry logic for failed agents
 * - Budget enforcement (max calls and latency)
 * - Comprehensive error handling and logging
 * - Conditional storage based on arbiter approval
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.77.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimit(userId: string): { allowed: boolean; resetTime: number } {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true, resetTime: now + RATE_LIMIT_WINDOW };
  }

  if (userLimit.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, resetTime: userLimit.resetTime };
  }

  userLimit.count++;
  return { allowed: true, resetTime: userLimit.resetTime };
}

/**
 * Invokes an agent with authenticated request headers.
 * Ensures auth token is forwarded to prevent 401 errors.
 */
async function invokeAgentWithAuth(
  supabase: any,
  functionName: string,
  body: any,
  authHeader: string
) {
  return supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: authHeader }
  });
}

// Budget constraints to prevent runaway costs
const MAX_RETRIES = 5;        // Maximum retry attempts per agent
const MAX_AGENT_CALLS = 5;    // Maximum total agent invocations
const MAX_LATENCY_MS = 60000; // Maximum total pipeline latency (60s)

// Valid fact status values for database storage
const FACT_STATUS_VALUES = new Set(['pending', 'verified', 'disputed', 'superseded']);

/**
 * Clamps confidence scores to [0.0, 1.0] range and rounds to 2 decimal places.
 * Returns null for invalid values.
 */
function clampConfidence(value: any): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  const bounded = Math.min(Math.max(value, 0), 1);
  return Math.round(bounded * 100) / 100;
}

/**
 * Chunks text into overlapping segments for embedding.
 * Uses 500-word chunks with 50-word overlap to preserve context.
 */
function chunkText(text: string, wordsPerChunk = 500, overlapWords = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += (wordsPerChunk - overlapWords)) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    chunks.push(chunk);
    
    // Stop if we've covered all words
    if (i + wordsPerChunk >= words.length) break;
  }
  
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Detects typed values from object string and returns appropriate columns.
 * Supports: numbers, dates, money amounts, percentages, country codes, entity references.
 */
function detectTypedValue(objectStr: string, predicate: string): any {
  const typed: any = {};
  
  // Number detection (employees, revenue_millions, etc.)
  if (/^\d+(\.\d+)?$/.test(objectStr.trim())) {
    typed.value_number = parseFloat(objectStr);
  }
  
  // Date detection (YYYY-MM-DD, YYYY)
  const dateMatch = objectStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    typed.value_date = objectStr;
  } else if (/^\d{4}$/.test(objectStr.trim())) {
    typed.value_date = `${objectStr}-01-01`;
  }
  
  // Money detection (e.g., "1234.56 SEK", "USD 1000")
  const moneyMatch = objectStr.match(/^([A-Z]{3})\s*([\d,.]+)|^([\d,.]+)\s*([A-Z]{3})$/);
  if (moneyMatch) {
    const amount = moneyMatch[2] || moneyMatch[3];
    const currency = moneyMatch[1] || moneyMatch[4];
    typed.value_money_amount = parseFloat(amount.replace(/,/g, ''));
    typed.value_money_ccy = currency;
  }
  
  // Percentage detection (e.g., "23.5%", "50 percent")
  const pctMatch = objectStr.match(/^([\d.]+)\s*%|^([\d.]+)\s*percent/i);
  if (pctMatch) {
    typed.value_pct = parseFloat(pctMatch[1] || pctMatch[2]);
  }
  
  // Country code detection (2-letter ISO codes)
  if (/^[A-Z]{2}$/.test(objectStr.trim())) {
    typed.value_country = objectStr;
  }
  
  // Code detection (e.g., ISIC codes, legal forms)
  if (predicate.includes('industry') || predicate.includes('legal_form') || predicate.includes('status')) {
    typed.value_code = objectStr;
  }
  
  return typed;
}

/**
 * Transforms resolver-agent output to database-ready fact rows.
 * Extracts subject-predicate-object triples from nested JSON structures
 * and detects typed values for structured storage.
 */
function transformNormalizedFacts(facts: any[] = [], documentId: string) {
  return facts
    .map((fact: any) => {
      const derived = fact?.derived ?? {};
      const triple = derived?.triple ?? {};

      const subject = triple.subject ?? derived.subject ?? derived.entity ?? null;
      const predicate = triple.predicate ?? derived.predicate ?? derived.relationship ?? null;
      const object = triple.object ?? derived.object ?? derived.value ?? null;

      if (!subject || !predicate || !object) {
        console.warn('Fact filtered - missing triple components:', { 
          subject: !!subject, predicate: !!predicate, object: !!object,
          fact_structure: Object.keys(fact),
          derived_keys: Object.keys(derived)
        });
        return null;
      }

      const evidence = derived.evidence ?? {};
      const evidenceText = evidence.text ?? derived.evidence_text ?? fact.evidence_text ?? fact.normalized_statement ?? fact.original_statement ?? null;
      const evidenceDocId = evidence.document_id ?? derived.evidence_doc_id ?? derived.document_id ?? documentId;
      const span = evidence.span ?? derived.evidence_span ?? fact.evidence_span;
      const confidenceCandidate = clampConfidence(fact.confidence_numeric ?? derived.confidence);
      const statusCandidate = typeof derived.status === 'string' && FACT_STATUS_VALUES.has(derived.status) ? derived.status : 'verified';

      // Detect typed values
      const typedValues = detectTypedValue(String(object), String(predicate));

      return {
        subject,
        predicate,
        object,
        ...typedValues, // Add typed columns
        evidence_text: evidenceText ?? null,
        evidence_doc_id: evidenceDocId ?? documentId,
        evidence_span_start: typeof span?.start === 'number' ? span.start : null,
        evidence_span_end: typeof span?.end === 'number' ? span.end : null,
        confidence: confidenceCandidate ?? 0.8,
        status: statusCandidate,
        created_by: null
      };
    })
    .filter(fact => Boolean(fact));
}

/**
 * Implements exponential backoff retry logic for agent invocations.
 * Retries on rate limits and service errors, but not on client errors (4xx).
 * Delay formula: 2^retries * 1000ms (1s, 2s, 4s, 8s, 16s)
 */
async function retryWithBackoff(fn: () => Promise<any>, retries = 0): Promise<any> {
  try {
    const response = await fn();
    
    // Check for errors in Supabase function response
    if (response.error) {
      // Don't retry on client errors
      const errorMsg = response.error.message || '';
      if (errorMsg.includes('400') || errorMsg.includes('401') || errorMsg.includes('402')) {
        return response;
      }
      
      // Retry on rate limits or service errors
      if (retries < MAX_RETRIES) {
        const delay = Math.pow(2, retries) * 1000;
        console.log(`Retrying after ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return retryWithBackoff(fn, retries + 1);
      }
    }
    
    return response;
  } catch (error) {
    if (retries < MAX_RETRIES) {
      const delay = Math.pow(2, retries) * 1000;
      console.log(`Network error, retrying after ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries + 1);
    }
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    const rateLimit = checkRateLimit(user.id);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { documentText, documentId, environment = 'dev' } = body;

    if (!documentText || typeof documentText !== 'string') {
      return new Response(
        JSON.stringify({ error: 'documentText is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (documentText.length < 20 || documentText.length > 1000000) {
      return new Response(
        JSON.stringify({ error: 'documentText must be between 20 and 1,000,000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!documentId || typeof documentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
      return new Response(
        JSON.stringify({ error: 'documentId must be a valid UUID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch coordinator agent definition
    const { data: agentData, error: agentError } = await supabase
      .from('agent_definitions')
      .select('agent_id, name')
      .eq('name', 'coordinator')
      .single();

    if (agentError || !agentData) {
      console.error('Coordinator agent not found:', agentError);
      return new Response(
        JSON.stringify({ error: 'Coordinator agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Single-run guard using DB-level partial unique index
    // The index (ux_single_running_run) ensures only one row with status_code='running' exists
    // If another run is active, the insert will fail with code 23505 and we return 429
    const { data: runData, error: runError } = await supabase
      .from('runs')
      .insert({
        env_code: environment,
        status_code: 'running'
      })
      .select()
      .single();

    if (runError || !runData) {
      const code = (runError as any)?.code || (runError as any)?.details || '';
      const msg = (runError as any)?.message || '';
      if (String(code).includes('23505') || msg.toLowerCase().includes('unique')) {
        return new Response(
          JSON.stringify({ error: 'Another run is already in progress. Try again shortly.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('Error creating run:', runError);
      return new Response(
        JSON.stringify({ error: 'Failed to create run record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const runId = runData.run_id;
    const stepsCompleted: string[] = [];
    const errors: Array<{ 
      step: string; 
      message: string;
      error_code?: string;
      error_details?: string;
    }> = [];
    let agentCallCount = 0;
    let finalStatus = 'success';
    let entitiesStored = 0;
    let factsStored = 0;
    let researchResult: any = null;
    let resolverResult: any = null;
    let criticResult: any = null;
    let arbiterResult: any = null;

    try {
      // ====== PIPELINE EXECUTION ======

      // Step 2.5: Chunk document and store with embeddings
      console.log('Step 2.5: Chunking document...');
      const chunks = chunkText(documentText);
      console.log(`Created ${chunks.length} chunks from document`);

      try {
        // Store chunks
        const chunkInserts = chunks.map((text, idx) => ({
          document_id: documentId,
          seq: idx,
          chunk_text: text,
          word_count: text.split(/\s+/).length
        }));
        
        const { data: insertedChunks, error: chunkError } = await supabase
          .from('document_chunks')
          .insert(chunkInserts)
          .select();
        
        if (!chunkError && insertedChunks) {
          console.log(`Stored ${insertedChunks.length} document chunks`);
          // Note: Embeddings will be generated asynchronously via a separate process
        }
      } catch (error: any) {
        console.error('Error storing document chunks:', error);
        // Non-fatal error, continue processing
      }

      // Step 3: Call research-agent
      console.log('Step 1: Calling research-agent...');
      
      if (agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
        try {
          agentCallCount++;
          const researchResponse = await retryWithBackoff(() =>
            invokeAgentWithAuth(supabase, 'research-agent', { documentText, documentId, environment }, authHeader)
          );

          if (researchResponse.error) {
            errors.push({ step: 'research', message: researchResponse.error.message });
          } else {
            researchResult = researchResponse.data;
            stepsCompleted.push('research');
            console.log('Research-agent completed successfully');
          }
        } catch (error: any) {
          errors.push({ step: 'research', message: error.message });
        }
      }

      // Step 4: Call resolver-agent (if research succeeded)
      
      if (researchResult && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
        console.log('Step 2: Calling resolver-agent...');
        try {
          agentCallCount++;
          const resolverResponse = await retryWithBackoff(() =>
            invokeAgentWithAuth(supabase, 'resolver-agent', {
              entities: researchResult.entities || [],
              facts: researchResult.facts || [],
              environment
            }, authHeader)
          );

          if (resolverResponse.error) {
            // Fail fast if function not found
            if (resolverResponse.error.message?.includes('not found') || 
                resolverResponse.error.message?.includes('FunctionsRelayError')) {
              errors.push({ 
                step: 'resolver', 
                message: 'resolver-agent function not found or not deployed' 
              });
              console.error('Resolver function missing - skipping retries');
              // Don't retry, continue to finalize
            } else {
              errors.push({ step: 'resolver', message: resolverResponse.error.message });
            }
          } else {
            resolverResult = resolverResponse.data;
            stepsCompleted.push('resolver');
            console.log('Resolver-agent completed successfully');
          }
        } catch (error: any) {
          errors.push({ step: 'resolver', message: error.message });
        }
      }

      // Step 5: Call critic-agent (if resolver succeeded)
      
      if (resolverResult && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
        console.log('Step 3: Calling critic-agent...');
        try {
          agentCallCount++;
          const criticFacts = resolverResult?.normalized?.normalized_facts?.length
            ? resolverResult.normalized.normalized_facts
            : (researchResult?.facts || []);

          const criticResponse = await retryWithBackoff(() =>
            invokeAgentWithAuth(supabase, 'critic-agent', { documentId, environment, facts: criticFacts }, authHeader)
          );

          if (criticResponse.error) {
            errors.push({ step: 'critic', message: criticResponse.error.message });
          } else {
            criticResult = criticResponse.data;
            stepsCompleted.push('critic');
            console.log('Critic-agent completed successfully');
          }
        } catch (error: any) {
          errors.push({ step: 'critic', message: error.message });
        }
      }

      // Step 6: Call arbiter-agent (if critic passed)
      
      if (criticResult?.validation?.is_valid && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
        console.log('Step 4: Calling arbiter-agent...');
        try {
          agentCallCount++;
          const arbiterResponse = await retryWithBackoff(() =>
            invokeAgentWithAuth(supabase, 'arbiter-agent', {
              facts: researchResult.facts || [],
              entities: researchResult.entities || [],
              environment
            }, authHeader)
          );

          if (arbiterResponse.error) {
            errors.push({ step: 'arbiter', message: arbiterResponse.error.message });
          } else {
            arbiterResult = arbiterResponse.data;
            stepsCompleted.push('arbiter');
            console.log('Arbiter-agent completed successfully');
            console.log('Arbiter decision:', arbiterResult?.policy?.decision);
            
            // Validate arbiter response structure
            if (!arbiterResult?.policy || !arbiterResult?.policy?.decision) {
              console.error('Invalid arbiter response structure:', arbiterResult);
              errors.push({ 
                step: 'arbiter', 
                message: 'Arbiter returned malformed response: missing policy.decision' 
              });
            }
          }
        } catch (error: any) {
          console.error('Arbiter-agent failed:', error);
          console.error('Error stack:', error.stack);
          errors.push({ 
            step: 'arbiter', 
            message: error.message,
            error_code: error.code,
            error_details: error.toString()
          });
        }
      }

      // Step 7: Store entities (after resolver, before arbiter)
      
      if (resolverResult?.normalized?.normalized_entities && resolverResult.normalized.normalized_entities.length > 0) {
        const entitiesToStore = resolverResult.normalized.normalized_entities;
        
        const { data: insertedEntities, error: entityError } = await supabase
          .from('entities')
          .insert(entitiesToStore.map((e: any) => ({
            legal_name: e.canonical_name || e.original_name,
            entity_type: e.entity_type,
            identifiers: e.derived?.identifiers || {},
            trading_names: e.original_name !== e.canonical_name ? [e.original_name] : [],
            addresses: e.derived?.addresses || [],
            relationships: e.derived?.relationships || [],
            website: e.derived?.website,
            metadata: { 
              source: 'coordinator', 
              document_id: documentId,
              run_id: runId,
              original_name: e.original_name
            }
          })))
          .select('id');
        
        if (!entityError && insertedEntities) {
          entitiesStored = insertedEntities.length;
          console.log(`Stored ${entitiesStored} entities after resolver`);
        } else if (entityError) {
          console.error('Error storing entities:', entityError);
          errors.push({ step: 'entity-storage', message: entityError.message });
        }
      }

      // Step 8: Store facts (only if arbiter approved)
      
      console.log('Arbiter decision:', arbiterResult?.policy?.decision);
      if (arbiterResult?.policy?.decision === 'ALLOW' && resolverResult?.normalized?.normalized_facts && resolverResult.normalized.normalized_facts.length > 0) {
        const factsToStore = resolverResult.normalized.normalized_facts;
        const factRows = transformNormalizedFacts(factsToStore, documentId);

        if (factRows.length === 0) {
          console.log('No well-formed facts available after normalization; skipping insert.');
        } else {
          const { data: insertedFacts, error: factError } = await supabase
            .from('facts')
            .insert(factRows)
            .select('id');

          if (!factError && insertedFacts) {
            factsStored = insertedFacts.length;
            console.log(`Stored ${factsStored} facts after arbiter approval`);
          } else if (factError) {
            console.error('Error storing facts:', factError);
            errors.push({ step: 'fact-storage', message: factError.message });
          }
        }
      } else if (arbiterResult?.policy?.decision === 'BLOCK') {
        console.log('Facts blocked by arbiter - not storing');
      } else if (arbiterResult?.policy?.decision === 'WARN') {
        console.log('Facts flagged with warning by arbiter - not storing');
      } else {
        console.log('No arbiter decision or facts not ready for storage');
      }

      // Step 9: Determine workflow status
      const totalLatency = Date.now() - startTime;
      const budgetExceeded = agentCallCount >= MAX_AGENT_CALLS || totalLatency >= MAX_LATENCY_MS;
      
      if (errors.length > 0 || !arbiterResult) {
        finalStatus = stepsCompleted.length > 0 ? 'partial' : 'error';
      }
      if (budgetExceeded) {
        finalStatus = 'partial';
        errors.push({ 
          step: 'coordinator', 
          message: `Budget exceeded: ${agentCallCount}/${MAX_AGENT_CALLS} calls, ${totalLatency}ms/${MAX_LATENCY_MS}ms` 
        });
      }

    } catch (error: any) {
      console.error('Fatal error in coordinator pipeline:', error);
      errors.push({ step: 'fatal', message: error.message });
      finalStatus = 'error';
    } finally {
      // ALWAYS update run status, even if pipeline crashed
      const totalLatency = Date.now() - startTime;
      await supabase
        .from('runs')
        .update({
          status_code: finalStatus,
          ended_at: new Date().toISOString(),
          metrics_json: {
            workflow_status: finalStatus,
            steps_completed: stepsCompleted,
            total_latency_ms: totalLatency,
            agent_calls: agentCallCount,
            entities_extracted: researchResult?.entities?.length || 0,
            facts_extracted: researchResult?.facts?.length || 0,
            entities_stored: entitiesStored,
            facts_stored: factsStored,
            arbiter_decision: arbiterResult?.policy?.decision || 'UNKNOWN',
            errors_count: errors.length,
            errors: errors.length > 0 ? errors : undefined
          }
        })
        .eq('run_id', runId);
    }

    return new Response(
      JSON.stringify({
        success: finalStatus === 'success',
        run_id: runId,
        status: finalStatus,
        entities_extracted: researchResult?.entities?.length || 0,
        facts_extracted: researchResult?.facts?.length || 0,
        entities_stored: entitiesStored,
        facts_stored: factsStored,
        facts_approved: arbiterResult?.policy?.decision === 'ALLOW' ? factsStored : 0,
        blocked_by_arbiter: arbiterResult?.policy?.decision === 'BLOCK' ? (researchResult?.facts?.length || 0) : 0,
        agents_executed: [
          { agent_name: 'research-agent', status: researchResult ? 'success' : 'failed' },
          { agent_name: 'resolver-agent', status: resolverResult ? 'success' : 'failed' },
          { agent_name: 'critic-agent', status: criticResult ? 'success' : 'failed' },
          { agent_name: 'arbiter-agent', status: arbiterResult ? 'success' : 'failed' }
        ].filter(a => stepsCompleted.includes(a.agent_name.split('-')[0])),
        total_latency_ms: Date.now() - startTime,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

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
                error_stack: error.stack,
                error_stage: 'coordinator-fatal',
                failed_at: new Date().toISOString(),
                total_latency_ms: Date.now() - startTime
              }
            })
            .eq('run_id', runningRuns[0].run_id);
          
          console.log(`Marked run ${runningRuns[0].run_id} as failed`);
        }
      }
    } catch (updateError) {
      console.error('Failed to update run status on error:', updateError);
    }
    
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
