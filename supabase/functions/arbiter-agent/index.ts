import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.77.0";
import { callAI, parseAIResponse } from "../_shared/ai-caller.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { facts, entities, environment = 'dev' } = await req.json();

    if (!facts && !entities) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: facts or entities' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Fetch agent definition
    const { data: agentData, error: agentError } = await supabase
      .from('agent_definitions')
      .select('agent_id, name, preferred_model_family, reasoning_effort')
      .eq('name', 'arbiter-agent')
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

    // Step 5: Call AI using model-agnostic caller with deterministic settings
    const inputData = JSON.stringify({ facts: facts || [], entities: entities || [] });

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
          name: 'apply_policies',
          description: 'Apply policy gates for PII, IP, compliance, and citation requirements',
          parameters: {
            type: 'object',
            properties: {
              decision: {
                type: 'string',
                enum: ['ALLOW', 'BLOCK', 'WARN']
              },
              reasons: {
                type: 'array',
                items: { type: 'string' }
              },
              pii_detected: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { 
                      type: 'string',
                      enum: ['ssn', 'credit_card', 'phone', 'email', 'medical_record']
                    },
                    location: { type: 'string' }
                  }
                }
              },
              missing_citations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    fact_id: { type: 'string' },
                    confidence: { type: 'number' }
                  }
                }
              },
              disclosures: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['decision', 'reasons']
          }
        }
      }],
      tool_choice: { type: 'function', function: { name: 'apply_policies' } },
      temperature: 0.1,
      reasoning_effort: agentData.reasoning_effort || 'low',
      seed: 42
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

    const policyResult = JSON.parse(toolCall.function.arguments);

    // Step 6: Create node_run record
    const { data: nodeRunData } = await supabase
      .from('node_runs')
      .insert({
        run_id: runId,
        agent_id: agentData.agent_id,
        prompt_version_id: bindingData.prompt_version_id,
        node_id: 'arbiter-agent',
        rendered_prompt_text: systemPrompt,
        input_vars_json: { 
          factsCount: facts?.length || 0, 
          entitiesCount: entities?.length || 0 
        },
        outputs_json: policyResult,
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
          tool_name: 'apply_policies',
          tool_args_json: policyResult
        }
      ]);
    }

    // Step 8: Record guardrail results
    if (nodeRunData) {
      const guardrailStatus = policyResult.decision === 'ALLOW' ? 'pass' : 
                              policyResult.decision === 'BLOCK' ? 'fail' : 'warn';
      await supabase.from('guardrail_results').insert({
        node_run_id: nodeRunData.node_run_id,
        suite: 'arbiter-policy',
        status_code: guardrailStatus,
        details_json: {
          decision: policyResult.decision,
          reasons: policyResult.reasons,
          pii_detected: policyResult.pii_detected || [],
          missing_citations: policyResult.missing_citations || []
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
          decision: policyResult.decision,
          pii_detected_count: policyResult.pii_detected?.length || 0,
          missing_citations_count: policyResult.missing_citations?.length || 0
        }
      })
      .eq('run_id', runId);

    return new Response(
      JSON.stringify({
        success: true,
        runId,
        nodeRunId: nodeRunData?.node_run_id,
        policy: policyResult,
        metrics: {
          total_latency_ms: totalLatency,
          decision: policyResult.decision
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Unexpected error in arbiter-agent:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
