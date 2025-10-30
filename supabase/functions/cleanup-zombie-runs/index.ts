import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting cleanup of zombie runs...');

    // Calculate timeout threshold (10 minutes ago)
    const timeoutThreshold = new Date();
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - 10);

    // Find runs that are stuck in "running" status for more than 10 minutes
    const { data: zombieRuns, error: selectError } = await supabase
      .from('runs')
      .select('run_id, started_at')
      .eq('status_code', 'running')
      .lt('started_at', timeoutThreshold.toISOString());

    if (selectError) {
      console.error('Error finding zombie runs:', selectError);
      throw selectError;
    }

    if (!zombieRuns || zombieRuns.length === 0) {
      console.log('No zombie runs found.');
      return new Response(
        JSON.stringify({ 
          success: true, 
          cleaned: 0,
          message: 'No zombie runs found' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${zombieRuns.length} zombie runs to clean up`);

    // Update all zombie runs to "timeout" status
    const runIds = zombieRuns.map(r => r.run_id);
    const { error: updateError } = await supabase
      .from('runs')
      .update({
        status_code: 'timeout',
        ended_at: new Date().toISOString()
      })
      .in('run_id', runIds);

    if (updateError) {
      console.error('Error updating zombie runs:', updateError);
      throw updateError;
    }

    console.log(`Successfully cleaned up ${zombieRuns.length} zombie runs`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        cleaned: zombieRuns.length,
        run_ids: runIds,
        message: `Cleaned up ${zombieRuns.length} zombie runs` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Cleanup job failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
