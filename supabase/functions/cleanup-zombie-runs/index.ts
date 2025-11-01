import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 2;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

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
