import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

interface ModelConfig {
  supports_temperature: boolean;
  supports_seed: boolean;
  reasoning_effort_levels: string[] | null;
  max_output_tokens_param: string;
  api_endpoint: string;
}

interface CallAIParams {
  model: string;
  messages: any[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  seed?: number;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  max_output_tokens?: number;
}

/**
 * Model-agnostic AI caller that handles differences between Lovable AI (Gemini)
 * and OpenAI (GPT-5, O3, etc.) APIs.
 * 
 * Key differences handled:
 * - Lovable AI/Gemini: supports temperature, uses max_tokens
 * - OpenAI GPT-5/O3: NO temperature support, uses reasoning_effort, uses max_completion_tokens
 * - Seed support varies by model family
 */
export async function callAI(
  supabaseUrl: string,
  supabaseKey: string,
  params: CallAIParams
): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Extract model family from model string (e.g., "google/gemini-2.5-flash" -> "gemini-2.5-flash")
  const modelFamily = params.model.includes('/') 
    ? params.model.split('/')[1] 
    : params.model;

  // Fetch model configuration from database
  const { data: config, error: configError } = await supabase
    .from('model_configurations')
    .select('*')
    .eq('model_family_code', modelFamily)
    .single();

  if (configError || !config) {
    throw new Error(`Unknown model family: ${modelFamily}. Error: ${configError?.message || 'Not found'}`);
  }

  const modelConfig = config as unknown as ModelConfig;

  // Build request body based on model capabilities
  const body: any = {
    model: params.model,
    messages: params.messages,
  };

  // Add tools if provided
  if (params.tools) body.tools = params.tools;
  if (params.tool_choice) body.tool_choice = params.tool_choice;

  // Handle temperature vs reasoning_effort
  // Lovable AI (Gemini) uses temperature, OpenAI GPT-5 uses reasoning_effort
  if (modelConfig.supports_temperature && params.temperature !== undefined) {
    body.temperature = params.temperature;
  } else if (modelConfig.reasoning_effort_levels && params.reasoning_effort) {
    body.reasoning_effort = params.reasoning_effort;
  }

  // Handle seed for reproducibility (OpenAI supports this)
  if (modelConfig.supports_seed && params.seed !== undefined) {
    body.seed = params.seed;
  }

  // Handle max tokens parameter naming
  // Lovable AI/Gemini: max_tokens
  // OpenAI GPT-5: max_completion_tokens
  if (params.max_output_tokens) {
    body[modelConfig.max_output_tokens_param] = params.max_output_tokens;
  }

  // Determine API key based on endpoint
  const apiKey = modelConfig.api_endpoint.includes('lovable') 
    ? Deno.env.get('LOVABLE_API_KEY')
    : Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error(`API key not configured for ${modelConfig.api_endpoint}`);
  }

  // Make request to AI provider
  const response = await fetch(modelConfig.api_endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`AI API error (${response.status}):`, errorText);
    throw new Error(`AI API error: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Helper to parse AI response and handle errors
 */
export async function parseAIResponse(response: Response): Promise<any> {
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`AI returned error: ${JSON.stringify(data.error)}`);
  }

  return data;
}
