import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.77.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 5;
const MAX_AGENT_CALLS = 5;
const MAX_LATENCY_MS = 60000;

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
    const { documentText, documentId, environment = 'dev' } = await req.json();

    if (!documentText || !documentId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: documentText, documentId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Step 2: Create coordinator run
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
    const stepsCompleted: string[] = [];
    const errors: Array<{ step: string; message: string }> = [];
    let agentCallCount = 0;

    // Step 3: Call research-agent
    console.log('Step 1: Calling research-agent...');
    let researchResult: any = null;
    
    if (agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
      try {
        agentCallCount++;
        const researchResponse = await retryWithBackoff(() =>
          supabase.functions.invoke('research-agent', {
            body: { documentText, documentId, environment }
          })
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
    let resolverResult: any = null;
    
    if (researchResult && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
      console.log('Step 2: Calling resolver-agent...');
      try {
        agentCallCount++;
        const resolverResponse = await retryWithBackoff(() =>
          supabase.functions.invoke('resolver-agent', {
            body: {
              entities: researchResult.entities || [],
              facts: researchResult.facts || [],
              environment
            }
          })
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
    let criticResult: any = null;
    
    if (resolverResult && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
      console.log('Step 3: Calling critic-agent...');
      try {
        agentCallCount++;
        const criticResponse = await retryWithBackoff(() =>
          supabase.functions.invoke('critic-agent', {
            body: { documentId, environment }
          })
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
    let arbiterResult: any = null;
    
    if (criticResult?.validation?.is_valid && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
      console.log('Step 4: Calling arbiter-agent...');
      try {
        agentCallCount++;
        const arbiterResponse = await retryWithBackoff(() =>
          supabase.functions.invoke('arbiter-agent', {
            body: {
              facts: researchResult.facts || [],
              entities: researchResult.entities || [],
              environment
            }
          })
        );

        if (arbiterResponse.error) {
          errors.push({ step: 'arbiter', message: arbiterResponse.error.message });
        } else {
          arbiterResult = arbiterResponse.data;
          stepsCompleted.push('arbiter');
          console.log('Arbiter-agent completed successfully');
        }
      } catch (error: any) {
        errors.push({ step: 'arbiter', message: error.message });
      }
    }

    // Step 7: Store entities (after resolver, before arbiter)
    let entitiesStored = 0;
    
    if (resolverResult?.normalized?.normalized_entities) {
      const entitiesToStore = resolverResult.normalized.normalized_entities;
      
      if (entitiesToStore.length > 0) {
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
    }

    // Step 8: Store facts (only if arbiter approved)
    let factsStored = 0;
    
    if (arbiterResult?.policy?.decision === 'APPROVED' && resolverResult?.normalized?.normalized_facts) {
      const factsToStore = resolverResult.normalized.normalized_facts;
      
      if (factsToStore.length > 0) {
        const { data: insertedFacts, error: factError } = await supabase
          .from('facts')
          .insert(factsToStore.map((f: any) => ({
            subject: f.normalized_statement?.split(' ')[0] || f.original_statement.split(' ')[0],
            predicate: 'states',
            object: f.normalized_statement || f.original_statement,
            evidence_text: f.original_statement,
            evidence_doc_id: documentId,
            confidence: f.confidence_numeric || 0.8,
            status: 'approved',
            created_by: null,
            metadata: { 
              source: 'coordinator',
              run_id: runId,
              normalized_by: 'resolver-agent',
              approved_by: 'arbiter-agent'
            }
          })))
          .select('id');
        
        if (!factError && insertedFacts) {
          factsStored = insertedFacts.length;
          console.log(`Stored ${factsStored} facts after arbiter approval`);
        } else if (factError) {
          console.error('Error storing facts:', factError);
          errors.push({ step: 'fact-storage', message: factError.message });
        }
      }
    }

    // Step 8: Determine workflow status
    const totalLatency = Date.now() - startTime;
    const budgetExceeded = agentCallCount >= MAX_AGENT_CALLS || totalLatency >= MAX_LATENCY_MS;
    
    let workflowStatus = 'success';
    if (errors.length > 0 || !arbiterResult) {
      workflowStatus = stepsCompleted.length > 0 ? 'partial' : 'failed';
    }
    if (budgetExceeded) {
      workflowStatus = 'partial';
      errors.push({ 
        step: 'coordinator', 
        message: `Budget exceeded: ${agentCallCount}/${MAX_AGENT_CALLS} calls, ${totalLatency}ms/${MAX_LATENCY_MS}ms` 
      });
    }

    // Step 9: Update run status
    await supabase
      .from('runs')
      .update({
        status_code: workflowStatus,
        ended_at: new Date().toISOString(),
        metrics_json: {
          workflow_status: workflowStatus,
          steps_completed: stepsCompleted,
          total_latency_ms: totalLatency,
          agent_calls: agentCallCount,
          entities_extracted: researchResult?.entities?.length || 0,
          facts_extracted: researchResult?.facts?.length || 0,
          entities_stored: entitiesStored,
          facts_stored: factsStored,
          arbiter_decision: arbiterResult?.policy?.decision || 'UNKNOWN',
          errors_count: errors.length
        }
      })
      .eq('run_id', runId);

    return new Response(
      JSON.stringify({
        success: workflowStatus === 'success',
        run_id: runId,
        status: workflowStatus,
        entities_extracted: researchResult?.entities?.length || 0,
        facts_extracted: researchResult?.facts?.length || 0,
        entities_stored: entitiesStored,
        facts_stored: factsStored,
        facts_approved: arbiterResult?.policy?.decision === 'APPROVED' ? factsStored : 0,
        blocked_by_arbiter: arbiterResult?.policy?.decision === 'BLOCKED' ? (researchResult?.facts?.length || 0) : 0,
        agents_executed: [
          { agent_name: 'research-agent', status: researchResult ? 'success' : 'failed' },
          { agent_name: 'resolver-agent', status: resolverResult ? 'success' : 'failed' },
          { agent_name: 'critic-agent', status: criticResult ? 'success' : 'failed' },
          { agent_name: 'arbiter-agent', status: arbiterResult ? 'success' : 'failed' }
        ].filter(a => stepsCompleted.includes(a.agent_name.split('-')[0])),
        total_latency_ms: totalLatency,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Unexpected error in coordinator:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
