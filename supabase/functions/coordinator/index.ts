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

    // Step 4: Call solver-agent (if research succeeded)
    let solverResult: any = null;
    
    if (researchResult && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
      console.log('Step 2: Calling solver-agent...');
      try {
        agentCallCount++;
        const solverResponse = await retryWithBackoff(() =>
          supabase.functions.invoke('solver-agent', {
            body: {
              entities: researchResult.entities || [],
              facts: researchResult.facts || [],
              environment
            }
          })
        );

        if (solverResponse.error) {
          errors.push({ step: 'solver', message: solverResponse.error.message });
        } else {
          solverResult = solverResponse.data;
          stepsCompleted.push('solver');
          console.log('Solver-agent completed successfully');
        }
      } catch (error: any) {
        errors.push({ step: 'solver', message: error.message });
      }
    }

    // Step 5: Call critic-agent (if solver succeeded)
    let criticResult: any = null;
    
    if (solverResult && agentCallCount < MAX_AGENT_CALLS && (Date.now() - startTime) < MAX_LATENCY_MS) {
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

    // Step 7: Determine workflow status
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

    // Step 8: Update run status
    await supabase
      .from('runs')
      .update({
        status_code: workflowStatus === 'success' ? 'success' : 'partial',
        ended_at: new Date().toISOString(),
        metrics_json: {
          workflow_status: workflowStatus,
          steps_completed: stepsCompleted,
          total_latency_ms: totalLatency,
          agent_calls: agentCallCount,
          entities_extracted: researchResult?.entitiesExtracted || 0,
          facts_extracted: researchResult?.factsExtracted || 0,
          arbiter_decision: arbiterResult?.policy?.decision || 'UNKNOWN',
          errors_count: errors.length
        }
      })
      .eq('run_id', runId);

    return new Response(
      JSON.stringify({
        success: workflowStatus === 'success',
        runId,
        workflow_status: workflowStatus,
        steps_completed: stepsCompleted,
        entities_extracted: researchResult?.entitiesExtracted || 0,
        facts_extracted: researchResult?.factsExtracted || 0,
        arbiter_decision: arbiterResult?.policy?.decision || 'UNKNOWN',
        total_latency_ms: totalLatency,
        total_cost_usd: 0.0, // TODO: Calculate based on token usage
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
