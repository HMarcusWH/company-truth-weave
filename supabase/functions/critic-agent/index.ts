import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.77.0";

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
    const { documentId, environment = 'dev' } = await req.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: documentId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Fetch agent definition
    const { data: agentData, error: agentError } = await supabase
      .from('agent_definitions')
      .select('agent_id, name')
      .eq('name', 'critic-agent')
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

    // Step 3: Fetch facts for this document
    const { data: factsData, error: factsError } = await supabase
      .from('facts')
      .select('*')
      .eq('evidence_doc_id', documentId);

    if (factsError) {
      console.error('Error fetching facts:', factsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch facts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const facts = factsData || [];

    // Step 4: Create run record
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

    // Step 5: Call Lovable AI with function calling
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    const aiStartTime = Date.now();
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(facts) }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'validate_facts',
            description: 'Validate facts for contradictions, missing citations, and schema errors',
            parameters: {
              type: 'object',
              properties: {
                is_valid: { type: 'boolean' },
                contradictions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      fact1_id: { type: 'string' },
                      fact2_id: { type: 'string' },
                      reason: { type: 'string' }
                    },
                    required: ['fact1_id', 'fact2_id', 'reason']
                  }
                },
                missing_citations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      fact_id: { type: 'string' },
                      issue: { type: 'string' }
                    },
                    required: ['fact_id', 'issue']
                  }
                },
                schema_errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      fact_id: { type: 'string' },
                      error: { type: 'string' }
                    },
                    required: ['fact_id', 'error']
                  }
                }
              },
              required: ['is_valid', 'contradictions', 'missing_citations', 'schema_errors']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'validate_facts' } }
      }),
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

    const aiData = await aiResponse.json();
    const aiLatency = Date.now() - aiStartTime;

    // Step 6: Parse AI response
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

    const validationResult = JSON.parse(toolCall.function.arguments);

    // Step 7: Create node_run record
    const { data: nodeRunData } = await supabase
      .from('node_runs')
      .insert({
        run_id: runId,
        agent_id: agentData.agent_id,
        prompt_version_id: bindingData.prompt_version_id,
        node_id: 'critic-agent',
        rendered_prompt_text: systemPrompt,
        input_vars_json: { documentId, factsCount: facts.length },
        outputs_json: validationResult,
        tool_calls_json: [toolCall],
        model_family_code: 'gemini',
        model_params_json: { model: 'google/gemini-2.5-flash' },
        tokens_input: aiData.usage?.prompt_tokens || 0,
        tokens_output: aiData.usage?.completion_tokens || 0,
        latency_ms: aiLatency,
        status_code: 'success'
      })
      .select()
      .single();

    // Step 8: Log messages
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
          content_text: JSON.stringify(facts)
        },
        {
          node_run_id: nodeRunData.node_run_id,
          role_code: 'tool',
          tool_name: 'validate_facts',
          tool_args_json: validationResult
        }
      ]);
    }

    // Step 9: Record guardrail results
    if (nodeRunData) {
      const guardrailStatus = validationResult.is_valid ? 'pass' : 'fail';
      await supabase.from('guardrail_results').insert({
        node_run_id: nodeRunData.node_run_id,
        suite: 'critic-validation',
        status_code: guardrailStatus,
        details_json: {
          contradictions: validationResult.contradictions,
          missing_citations: validationResult.missing_citations,
          schema_errors: validationResult.schema_errors
        }
      });
    }

    // Step 10: Update run status
    const totalLatency = Date.now() - startTime;
    await supabase
      .from('runs')
      .update({
        status_code: 'success',
        ended_at: new Date().toISOString(),
        metrics_json: {
          total_latency_ms: totalLatency,
          ai_latency_ms: aiLatency,
          facts_validated: facts.length,
          is_valid: validationResult.is_valid,
          contradictions_found: validationResult.contradictions.length,
          missing_citations_found: validationResult.missing_citations.length,
          schema_errors_found: validationResult.schema_errors.length
        }
      })
      .eq('run_id', runId);

    return new Response(
      JSON.stringify({
        success: true,
        runId,
        nodeRunId: nodeRunData?.node_run_id,
        validation: validationResult,
        metrics: {
          total_latency_ms: totalLatency,
          facts_validated: facts.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Unexpected error in critic-agent:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
