/**
 * Research Agent Edge Function
 * 
 * Purpose: Extract structured entities, relationships, and facts from unstructured documents.
 * 
 * Input:
 * - documentText: Raw text content to analyze
 * - documentId: UUID of source document
 * - environment: Target environment ('dev', 'staging', 'prod')
 * 
 * Output:
 * - entities: Array of extracted entity mentions (companies, people, products)
 * - facts: Array of statements with evidence spans and confidence scores
 * 
 * Features:
 * - PromptOps integration (versioned prompts, A/B testing)
 * - Model-agnostic AI calling (supports Gemini and GPT models)
 * - Structured output via function calling
 * - Full observability (runs, node_runs, message_logs, guardrails)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  let runId: string | null = null;

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
    const { documentText, documentId, environment = 'dev', runId } = body;
    
    if (!documentText || typeof documentText !== 'string' || documentText.length < 20 || documentText.length > 1000000) {
      return new Response(
        JSON.stringify({ error: 'documentText must be a string between 20 and 1,000,000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (documentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
      return new Response(
        JSON.stringify({ error: 'documentId must be a valid UUID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!runId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
      return new Response(
        JSON.stringify({ error: 'runId must be provided by coordinator and be a valid UUID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch agent definition (runId provided by coordinator)
    const { data: agent, error: agentError } = await supabase
      .from('agent_definitions')
      .select('agent_id, name, model_family_code, max_tokens, preferred_model_family, reasoning_effort')
      .eq('name', 'research-agent')
      .single();

    if (agentError || !agent) {
      console.error('Agent not found:', agentError);
      return new Response(
        JSON.stringify({ error: 'research-agent not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch active prompt binding
    const { data: binding, error: bindingError } = await supabase
      .from('prompt_bindings')
      .select(`
        binding_id,
        traffic_weight,
        prompt_versions (
          prompt_version_id,
          semver,
          content_text,
          variables_json,
          output_schema_json
        )
      `)
      .eq('agent_id', agent.agent_id)
      .eq('env_code', environment)
      .gte('traffic_weight', 1)
      .order('traffic_weight', { ascending: false })
      .limit(1)
      .single();

    if (bindingError || !binding) {
      console.error('No active prompt binding:', bindingError);
      return new Response(
        JSON.stringify({ error: 'No active prompt configured for research-agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const promptVersion = binding.prompt_versions as any;
    
    const startTime = Date.now();

    // Step 2: Render prompt with variables
    const inputVars = { document_text: documentText };
    const systemPrompt = promptVersion.content_text || 
      `You are an expert at extracting structured company intelligence from documents.

CRITICAL: You MUST use the extract_entities function to return your response.
Do NOT provide a text response. ALWAYS call the extract_entities function with the structured data.

Extract:
1. Entity mentions (company names, people, locations)
2. Relationships (CEO, parent company, subsidiary)
3. Facts with evidence and confidence scores (0.0-1.0)`;

    // Step 3: Fetch API version from model config
    const { data: modelConfig } = await supabase
      .from('model_configurations')
      .select('api_version')
      .eq('model_family_code', agent.preferred_model_family)
      .single();
    
    const apiVersion = modelConfig?.api_version || 'chat_completions';

    // Step 4: Call AI using model-agnostic caller
    const modelName = apiVersion === 'responses' 
      ? agent.preferred_model_family
      : agent.preferred_model_family.includes('/') 
        ? agent.preferred_model_family 
        : `google/${agent.preferred_model_family}`;

    const aiResponse = await callAI(supabaseUrl, supabaseServiceKey, {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: documentText }
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'extract_entities',
          description: 'Extract structured entities, relationships, and facts from company documents',
          parameters: {
            type: 'object',
            properties: {
              entities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    entity_type: { type: 'string', enum: ['company', 'person', 'product', 'location', 'event'] },
                    aliases: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['name', 'entity_type']
                }
              },
              facts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    statement: { type: 'string' },
                    evidence: { type: 'string' },
                    evidence_span: {
                      type: 'object',
                      description: 'Character offsets in document where evidence was found',
                      properties: {
                        start: { type: 'number', description: 'Starting character offset' },
                        end: { type: 'number', description: 'Ending character offset' }
                      },
                      required: ['start', 'end']
                    },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    entity_name: { type: 'string' }
                  },
                  required: ['statement', 'evidence', 'evidence_span', 'confidence']
                }
              }
            },
            required: ['entities', 'facts']
          }
        }
      }],
      tool_choice: { type: 'function', function: { name: 'extract_entities' } },
      temperature: 0.7,
      reasoning_effort: agent.reasoning_effort || undefined
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      return new Response(
        JSON.stringify({ error: 'AI gateway error', details: errorText }),
        { status: aiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await parseAIResponse(aiResponse, apiVersion);
    const latencyMs = Date.now() - startTime;

    // Extract function call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let extractedData = { entities: [], facts: [] };
    
    if (toolCall) {
      extractedData = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try parsing from text content
      const textContent = aiData.choices?.[0]?.message?.content;
      console.error('No tool call found. Text response:', textContent);
      
      if (textContent) {
        try {
          extractedData = JSON.parse(textContent);
          console.log('Recovered data from text response');
        } catch {
          return new Response(
            JSON.stringify({ 
              error: 'No tool call in response',
              hint: 'AI model provided text instead of function call. Check prompt or model settings.',
              text_response: textContent
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Step 5: Create node_run record
    const { data: nodeRun, error: nodeRunError } = await supabase
      .from('node_runs')
      .insert({
        run_id: runId,
        node_id: 'research-agent',
        agent_id: agent.agent_id,
        prompt_version_id: promptVersion.prompt_version_id,
        model_family_code: agent.preferred_model_family,
        input_vars_json: inputVars,
        rendered_prompt_text: systemPrompt,
        outputs_json: extractedData,
        tool_calls_json: toolCall ? [toolCall] : [],
        tokens_input: aiData.usage?.prompt_tokens || 0,
        tokens_output: aiData.usage?.completion_tokens || 0,
        latency_ms: latencyMs,
        status_code: 'success'
      })
      .select()
      .single();

    if (nodeRunError) {
      console.error('Failed to create node_run:', nodeRunError);
    }

    // Step 6: Log messages
    if (nodeRun) {
      await supabase.from('message_logs').insert([
        {
          node_run_id: nodeRun.node_run_id,
          role_code: 'system',
          content_text: systemPrompt
        },
        {
          node_run_id: nodeRun.node_run_id,
          role_code: 'user',
          content_text: documentText.substring(0, 1000) // Truncate for storage
        },
        {
          node_run_id: nodeRun.node_run_id,
          role_code: 'tool',
          tool_name: 'extract_entities',
          tool_args_json: extractedData
        }
      ]);
    }

    // Step 7: Record guardrail results (basic validation)
    if (nodeRun) {
      const hasEntities = extractedData.entities?.length > 0;
      const hasFacts = extractedData.facts?.length > 0;
      const validConfidences = extractedData.facts?.every((f: any) =>
        f.confidence >= 0 && f.confidence <= 1
      );

      await supabase.from('guardrail_results').insert({
        node_run_id: nodeRun.node_run_id,
        suite: 'data-quality',
        status_code: (hasEntities && hasFacts && validConfidences) ? 'pass' : 'warn',
        details_json: {
          entities_extracted: extractedData.entities?.length || 0,
          facts_extracted: extractedData.facts?.length || 0,
          valid_confidences: validConfidences
        }
      });
    }

    // Step 8: Return results (coordinator handles run status updates)
    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        node_run_id: nodeRun?.node_run_id,
        entities: extractedData.entities || [],
        facts: extractedData.facts || [],
        extracted: {
          entities: extractedData.entities?.length || 0,
          facts: extractedData.facts?.length || 0
        },
        latency_ms: latencyMs,
        prompt_version: promptVersion.semver
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Research agent error:', error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
