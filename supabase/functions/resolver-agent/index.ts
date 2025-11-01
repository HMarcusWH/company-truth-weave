/**
 * Resolver Agent Edge Function
 * 
 * Purpose: Normalize and deduplicate entities and facts to canonical forms.
 * 
 * Input:
 * - entities: Raw entity extractions from research-agent
 * - facts: Raw fact extractions from research-agent
 * - environment: Target environment
 * 
 * Output:
 * - normalized_entities: Canonical entity names and types
 * - normalized_facts: Standardized subject-predicate-object triples
 * - unknown_values: Fields that couldn't be normalized
 * 
 * Normalization tasks:
 * - Resolve company name variants (e.g., "Google" → "Alphabet Inc.")
 * - Standardize entity types to controlled vocabulary
 * - Extract structured triples from natural language statements
 * - Map evidence spans to normalized forms
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.77.0";
import { callAI, parseAIResponse } from "../_shared/ai-caller.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAuth = createClient(supabaseUrl, supabaseKey);
    
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
    const { entities, facts, environment = 'dev' } = body;

    if ((!entities || !Array.isArray(entities)) && (!facts || !Array.isArray(facts))) {
      return new Response(
        JSON.stringify({ error: 'entities or facts must be provided as arrays' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if ((entities && entities.length > 1000) || (facts && facts.length > 1000)) {
      return new Response(
        JSON.stringify({ error: 'Arrays must not exceed 1000 items' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Fetch agent definition
    const { data: agentData, error: agentError } = await supabase
      .from('agent_definitions')
      .select('agent_id, name, preferred_model_family, reasoning_effort')
      .eq('name', 'resolver-agent')
      .single();

    if (agentError || !agentData) {
      console.error('Agent not found:', agentError);
      return new Response(
        JSON.stringify({ error: 'Agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Fetch active prompt binding
    const { data: bindingData, error: bindingError } = await supabase
      .from('prompt_bindings')
      .select(`
        prompt_version_id,
        prompt_versions (
          semver,
          content_text,
          output_schema_json
        )
      `)
      .eq('agent_id', agentData.agent_id)
      .eq('env_code', environment)
      .lte('effective_from', new Date().toISOString())
      .or('effective_to.is.null,effective_to.gte.' + new Date().toISOString())
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (bindingError || !bindingData) {
      console.error('No active binding found:', bindingError);
      return new Response(
        JSON.stringify({ error: 'No active prompt binding found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const promptVersion = bindingData.prompt_versions as any;
    const systemPrompt = promptVersion.content_text;

    // Step 3: Create run record
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
      return new Response(
        JSON.stringify({ error: 'Failed to create run record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const runId = runData.run_id;

    // Step 4: Fetch API version from model config
    const { data: modelConfig } = await supabase
      .from('model_configurations')
      .select('api_version')
      .eq('model_family_code', agentData.preferred_model_family)
      .single();
    
    const apiVersion = modelConfig?.api_version || 'chat_completions';

    // Step 5: Call AI using model-agnostic caller
    const inputData = JSON.stringify({ entities: entities || [], facts: facts || [] });

    const modelName = apiVersion === 'responses'
      ? agentData.preferred_model_family
      : agentData.preferred_model_family.includes('/') 
        ? agentData.preferred_model_family 
        : `google/${agentData.preferred_model_family}`;

    const aiStartTime = Date.now();
    const aiResponse = await callAI(supabaseUrl, supabaseKey, {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: inputData }
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'normalize_data',
          description: 'Normalize entities and facts to canonical forms and schemas',
          parameters: {
            type: 'object',
            properties: {
              normalized_entities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    original_name: { type: 'string' },
                    canonical_name: { type: 'string' },
                    entity_type: { 
                      type: 'string',
                      enum: ['company', 'person', 'product', 'location', 'other']
                    },
                    derived: { type: 'object' }
                  },
                  required: ['original_name', 'canonical_name', 'entity_type']
                }
              },
              normalized_facts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    original_statement: { type: 'string' },
                    normalized_statement: { type: 'string' },
                    confidence_numeric: { type: 'number', minimum: 0, maximum: 1 },
                    derived: { type: 'object' }
                  },
                  required: ['original_statement', 'normalized_statement', 'confidence_numeric']
                }
              },
              unknown_values: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    reason: { type: 'string' }
                  }
                }
              }
            },
            required: ['normalized_entities', 'normalized_facts', 'unknown_values']
          }
        }
      }],
      tool_choice: { type: 'function', function: { name: 'normalize_data' } },
      temperature: 0.7,
      reasoning_effort: agentData.reasoning_effort || undefined
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);

      await supabase
        .from('runs')
        .update({
          status_code: 'error',
          ended_at: new Date().toISOString(),
          metrics_json: { error: errorText }
        })
        .eq('run_id', runId);

      return new Response(
        JSON.stringify({ error: 'AI API request failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await parseAIResponse(aiResponse, apiVersion);
    const aiLatency = Date.now() - aiStartTime;

    // Step 5: Parse AI response
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      await supabase
        .from('runs')
        .update({
          status_code: 'error',
          ended_at: new Date().toISOString(),
          metrics_json: { error: 'No tool call in response' }
        })
        .eq('run_id', runId);

      return new Response(
        JSON.stringify({ error: 'No tool call in AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedData = JSON.parse(toolCall.function.arguments);

    // Step 6: Create node_run record
    const { data: nodeRunData } = await supabase
      .from('node_runs')
      .insert({
        run_id: runId,
        agent_id: agentData.agent_id,
        prompt_version_id: bindingData.prompt_version_id,
        node_id: 'resolver-agent',
        rendered_prompt_text: systemPrompt,
        input_vars_json: { 
          entitiesCount: entities?.length || 0, 
          factsCount: facts?.length || 0 
        },
        outputs_json: normalizedData,
        tool_calls_json: [toolCall],
        model_family_code: agentData.preferred_model_family,
        model_params_json: { model: modelName },
        tokens_input: aiData.usage?.prompt_tokens || 0,
        tokens_output: aiData.usage?.completion_tokens || 0,
        latency_ms: aiLatency,
        status_code: 'success'
      })
      .select()
      .single();

    // Step 7: Log messages
    if (nodeRunData) {
      await supabase.from('message_logs').insert([
        {
          node_run_id: nodeRunData.node_run_id,
          role_code: 'system',
          content_text: systemPrompt
        },
        {
          node_run_id: nodeRunData.node_run_id,
          role_code: 'user',
          content_text: inputData
        },
        {
          node_run_id: nodeRunData.node_run_id,
          role_code: 'tool',
          tool_name: 'normalize_data',
          tool_args_json: normalizedData
        }
      ]);
    }

    // Step 8: Record guardrail results
    if (nodeRunData) {
      const guardrailStatus = normalizedData.unknown_values.length === 0 ? 'pass' : 'warn';
      await supabase.from('guardrail_results').insert({
        node_run_id: nodeRunData.node_run_id,
        suite: 'resolver-normalization',
        status_code: guardrailStatus,
        details_json: {
          unknown_values: normalizedData.unknown_values,
          entities_normalized: normalizedData.normalized_entities.length,
          facts_normalized: normalizedData.normalized_facts.length
        }
      });
    }

    // Step 9: Update run status
    const totalLatency = Date.now() - startTime;
    await supabase
      .from('runs')
      .update({
        status_code: 'success',
        ended_at: new Date().toISOString(),
        metrics_json: {
          total_latency_ms: totalLatency,
          ai_latency_ms: aiLatency,
          entities_normalized: normalizedData.normalized_entities.length,
          facts_normalized: normalizedData.normalized_facts.length,
          unknown_values_count: normalizedData.unknown_values.length
        }
      })
      .eq('run_id', runId);

    return new Response(
      JSON.stringify({
        success: true,
        runId,
        nodeRunId: nodeRunData?.node_run_id,
        normalized: normalizedData,
        metrics: {
          total_latency_ms: totalLatency,
          entities_normalized: normalizedData.normalized_entities.length,
          facts_normalized: normalizedData.normalized_facts.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Unexpected error in resolver-agent:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
