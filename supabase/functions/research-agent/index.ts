import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentText, documentId, environment = 'dev' } = await req.json();
    
    if (!documentText) {
      return new Response(
        JSON.stringify({ error: 'documentText is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch active prompt binding for research-agent in this environment
    const { data: agent, error: agentError } = await supabase
      .from('agent_definitions')
      .select('agent_id, name, model_family_code, max_tokens')
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
    
    // Step 2: Create run record
    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({
        env_code: environment,
        status_code: 'success',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (runError) {
      console.error('Failed to create run:', runError);
      return new Response(
        JSON.stringify({ error: 'Failed to create run record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startTime = Date.now();

    // Step 3: Render prompt with variables
    const inputVars = { document_text: documentText };
    const systemPrompt = promptVersion.content_text || 
      `You are an expert at extracting structured company intelligence from documents. Extract:
1. Entity mentions (company names, people, locations)
2. Relationships (CEO, parent company, subsidiary)
3. Facts with evidence and confidence scores (0.0-1.0)

Use the extract_entities function to return structured data.`;

    // Step 4: Call Lovable AI with function calling
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        temperature: 0.7, // Creative extraction
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
                      entity_type: { type: 'string', enum: ['company', 'person', 'product', 'location', 'other'] },
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
        tool_choice: { type: 'function', function: { name: 'extract_entities' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      
      // Update run status to error
      await supabase
        .from('runs')
        .update({ status_code: 'error', ended_at: new Date().toISOString() })
        .eq('run_id', run.run_id);
      
      return new Response(
        JSON.stringify({ error: 'AI gateway error', details: errorText }),
        { status: aiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    // Extract function call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const extractedData = toolCall ? JSON.parse(toolCall.function.arguments) : { entities: [], facts: [] };

    // Step 5: Create node_run record
    const { data: nodeRun, error: nodeRunError } = await supabase
      .from('node_runs')
      .insert({
        run_id: run.run_id,
        node_id: 'research-agent',
        agent_id: agent.agent_id,
        prompt_version_id: promptVersion.prompt_version_id,
        model_family_code: 'gemini-2.5-flash',
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

    // Step 7: Store extracted entities and facts
    const storedEntities = [];
    const storedFacts = [];

    // Store entities
    for (const entity of extractedData.entities || []) {
      const { data: storedEntity, error: entityError } = await supabase
        .from('entities')
        .insert({
          name: entity.name,
          entity_type: entity.entity_type,
          aliases: entity.aliases || []
        })
        .select()
        .single();

      if (!entityError && storedEntity) {
        storedEntities.push(storedEntity);
      }
    }

    // Store facts
    for (const fact of extractedData.facts || []) {
      // Find matching entity if entity_name provided
      let entityId = null;
      if (fact.entity_name) {
        const matchedEntity = storedEntities.find(e => 
          e.name.toLowerCase() === fact.entity_name.toLowerCase()
        );
        entityId = matchedEntity?.entity_id;
      }

      const { data: storedFact, error: factError } = await supabase
        .from('facts')
        .insert({
          entity_id: entityId,
          document_id: documentId || null,
          statement: fact.statement,
          evidence: fact.evidence,
          confidence: fact.confidence,
          status: 'pending'
        })
        .select()
        .single();

      if (!factError && storedFact) {
        storedFacts.push(storedFact);
      }
    }

    // Step 8: Record guardrail results (basic validation)
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

    // Step 9: Update run completion
    await supabase
      .from('runs')
      .update({ 
        status_code: 'success', 
        ended_at: new Date().toISOString(),
        metrics_json: {
          total_latency_ms: latencyMs,
          entities_stored: storedEntities.length,
          facts_stored: storedFacts.length
        }
      })
      .eq('run_id', run.run_id);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: run.run_id,
        node_run_id: nodeRun?.node_run_id,
        extracted: {
          entities: storedEntities.length,
          facts: storedFacts.length
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
