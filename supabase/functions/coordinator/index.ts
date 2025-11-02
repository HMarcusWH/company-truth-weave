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

type FactTransformOptions = {
  documentId: string;
  documentText: string;
  fallbackSourceUrl?: string | null;
  criticResult?: any;
  arbiterResult?: any;
};

function normalizeKey(value: any): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str.toLowerCase() : null;
}

function tripleKey(subject: string, predicate: string, object: string): string {
  return `${subject}||${predicate}||${object}`.toLowerCase();
}

function buildCriticIssueIndex(validation: any): Map<string, number> {
  const index = new Map<string, number>();
  if (!validation) return index;

  const register = (raw: any, penalty: number) => {
    const key = normalizeKey(raw);
    if (!key) return;
    const existing = index.get(key) ?? 0;
    index.set(key, Math.max(existing, penalty));
  };

  const registerIssue = (issue: any, penalty: number) => {
    if (issue === null || issue === undefined) return;
    if (typeof issue === 'string' || typeof issue === 'number') {
      register(issue, penalty);
      return;
    }

    if (typeof issue.fact_id !== 'undefined') {
      register(`id:${issue.fact_id}`, penalty);
    }
    if (Array.isArray(issue.fact_ids)) {
      issue.fact_ids.forEach((id: any) => register(`id:${id}`, penalty));
    }
    if (typeof issue.normalized_statement === 'string') {
      register(issue.normalized_statement, penalty);
    }
    if (typeof issue.original_statement === 'string') {
      register(issue.original_statement, penalty);
    }
    if (typeof issue.statement === 'string') {
      register(issue.statement, penalty);
    }
    if (issue.subject && issue.predicate && issue.object) {
      register(tripleKey(String(issue.subject), String(issue.predicate), String(issue.object)), penalty);
    }
  };

  (validation.missing_citations ?? []).forEach((item: any) => registerIssue(item, 0.2));
  (validation.schema_errors ?? []).forEach((item: any) => registerIssue(item, 0.25));
  (validation.contradictions ?? []).forEach((item: any) => {
    registerIssue(item, 0.3);
    if (Array.isArray(item?.fact_ids)) {
      item.fact_ids.forEach((id: any) => register(`id:${id}`, 0.3));
    }
  });
  if (Array.isArray(validation.issues)) {
    validation.issues.forEach((issue: any) => {
      const severity = String(issue?.severity ?? '').toLowerCase();
      const penalty = severity === 'high' ? 0.3 : severity === 'medium' ? 0.2 : 0.1;
      registerIssue(issue, penalty);
    });
  }

  return index;
}

function extractEvidenceText(span: any, fallbackText: string | null, documentText: string): string | null {
  if (span && typeof span.start === 'number' && typeof span.end === 'number' && span.end > span.start) {
    const safeStart = Math.max(0, span.start);
    const safeEnd = Math.min(documentText.length, span.end);
    if (safeEnd > safeStart) {
      const snippet = documentText.slice(safeStart, safeEnd).trim();
      if (snippet.length > 0) {
        return snippet;
      }
    }
  }
  const cleanFallback = fallbackText?.trim();
  return cleanFallback && cleanFallback.length > 0 ? cleanFallback : null;
}

function calculateFactConfidence(
  baseCandidate: number | null | undefined,
  fact: any,
  subject: string,
  predicate: string,
  object: string,
  validation: any,
  criticIssues: Map<string, number>,
  arbiterResult: any
): number {
  let confidence = typeof baseCandidate === 'number' ? baseCandidate : 0.8;

  const validationScore = clampConfidence(validation?.confidence_score);
  if (validationScore !== null) {
    confidence = (confidence + validationScore) / 2;
  }

  const keys = new Set<string>();
  const pushKey = (value: any) => {
    const key = normalizeKey(value);
    if (key) keys.add(key);
  };

  if (fact?.id) pushKey(`id:${fact.id}`);
  if (fact?.fact_id) pushKey(`id:${fact.fact_id}`);
  if (fact?.derived?.fact_id) pushKey(`id:${fact.derived.fact_id}`);
  if (fact?.derived?.source_fact_id) pushKey(`id:${fact.derived.source_fact_id}`);
  if (fact?.normalized_statement) pushKey(fact.normalized_statement);
  if (fact?.original_statement) pushKey(fact.original_statement);
  pushKey(tripleKey(String(subject), String(predicate), String(object)));

  let penalty = 0;
  keys.forEach((key) => {
    const keyPenalty = criticIssues.get(key);
    if (typeof keyPenalty === 'number') {
      penalty = Math.max(penalty, keyPenalty);
    }
  });

  if (!fact?.evidence && !fact?.evidence_text && !fact?.derived?.evidence_text) {
    penalty = Math.max(penalty, 0.15);
  }

  if (penalty > 0) {
    confidence -= penalty;
  }

  const decision = arbiterResult?.policy?.decision;
  if (decision === 'WARN') {
    confidence -= 0.1;
  } else if (decision === 'BLOCK') {
    confidence = 0;
  }

  const finalValue = clampConfidence(confidence);
  return finalValue ?? 0.8;
}

/**
 * Transforms resolver-agent output to database-ready fact rows.
 * Extracts subject-predicate-object triples from nested JSON structures,
 * enriches provenance, and normalizes confidence scores.
 */
function transformNormalizedFacts(facts: any[] = [], options: FactTransformOptions) {
  const validation = options.criticResult?.validation;
  const criticIssues = buildCriticIssueIndex(validation);

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
      const span = evidence.span ?? derived.evidence_span ?? fact.evidence_span;
      const evidenceDocId = evidence.document_id ?? derived.evidence_doc_id ?? derived.document_id ?? options.documentId;
      const fallbackEvidenceText = evidence.text
        ?? derived.evidence_text
        ?? fact.evidence_text
        ?? fact.normalized_statement
        ?? fact.original_statement
        ?? null;
      const evidenceText = extractEvidenceText(span, fallbackEvidenceText, options.documentText);
      const evidenceUrl = evidence.url
        ?? derived.evidence_url
        ?? derived.url
        ?? fact.evidence_url
        ?? options.fallbackSourceUrl
        ?? null;

      if (!evidenceDocId) {
        console.warn('Fact filtered - missing evidence_doc_id', { fact });
        return null;
      }
      if (!evidenceText) {
        console.warn('Fact filtered - missing evidence_text', { fact });
        return null;
      }

      const baseConfidence = clampConfidence(fact.confidence_numeric ?? derived.confidence ?? fact.confidence);
      const normalizedConfidence = calculateFactConfidence(
        baseConfidence,
        fact,
        String(subject),
        String(predicate),
        String(object),
        validation,
        criticIssues,
        options.arbiterResult
      );
      const statusCandidate = typeof derived.status === 'string' && FACT_STATUS_VALUES.has(derived.status)
        ? derived.status
        : 'verified';

      // Detect typed values
      const typedValues = detectTypedValue(String(object), String(predicate));
      const valueEntityId = typeof derived.value_entity_id === 'string'
        ? derived.value_entity_id
        : typeof derived.entity_id === 'string'
          ? derived.entity_id
          : typeof derived.object_entity_id === 'string'
            ? derived.object_entity_id
            : null;

      return {
        subject,
        predicate,
        object,
        ...typedValues,
        value_entity_id: valueEntityId ?? null,
        evidence_text: evidenceText,
        evidence_doc_id: evidenceDocId,
        evidence_url: evidenceUrl,
        evidence_span_start: typeof span?.start === 'number' ? span.start : null,
        evidence_span_end: typeof span?.end === 'number' ? span.end : null,
        confidence: normalizedConfidence,
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

    let runId: string | null = null;
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

    // Wrap entire pipeline in try/finally for guaranteed status updates
    try {
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

    let runId: string | null = null;
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

    const { data: documentRecord, error: documentError } = await supabase
      .from('documents')
      .select('id, source_url')
      .eq('id', documentId)
      .single();

    if (documentError || !documentRecord) {
      await supabase
        .from('runs')
        .update({
          status_code: 'error',
          ended_at: new Date().toISOString(),
          metrics_json: {
            workflow_status: 'error',
            error: 'Document not found',
            document_id: documentId
          }
        })
        .eq('run_id', runId);

      return new Response(
        JSON.stringify({ error: 'Document not found for ingestion' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const { data: runData, error: runError } = await supabase
        .from('runs')
        .insert({
          env_code: environment,
          status_code: 'running'
        })
        .select()
        .single();

      if (runError || !runData) {
        console.error('Error creating run:', runError);
        errors.push({ step: 'run-init', message: runError?.message || 'Failed to create run record' });
        finalStatus = 'error';
        return new Response(
          JSON.stringify({ error: 'Failed to create run record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      runId = runData.run_id;

      // Step 3: Chunk document and store
      console.log('Step 3: Chunking document...');
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

      // Step 4: Call research-agent with runId
      console.log('Step 4: Calling research-agent...');
      
      if (agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
        try {
          agentCallCount++;
          const researchResponse = await retryWithBackoff(() =>
            invokeAgentWithAuth(supabase, 'research-agent', { documentText, documentId, environment, runId }, authHeader)
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

      // Step 5: Call resolver-agent (if research succeeded)
      
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
        const factRows = transformNormalizedFacts(factsToStore, {
          documentId,
          documentText,
          fallbackSourceUrl: documentRecord?.source_url ?? null,
          criticResult,
          arbiterResult
        });

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
      return new Response(
        JSON.stringify({ error: error.message || 'Coordinator pipeline failed' }),
        { status: error.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      const totalLatency = Date.now() - startTime;
      if (runId) {
        try {
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
        } catch (updateError) {
          console.error('Failed to update run status:', updateError);
        }
      }

    }

    if (!runId) {
      return new Response(
        JSON.stringify({ error: 'Coordinator initialization failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
