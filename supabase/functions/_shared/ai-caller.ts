import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

interface ModelConfig {
  supports_temperature: boolean;
  supports_seed: boolean;
  reasoning_effort_levels: string[] | null;
  max_output_tokens_param: string;
  api_endpoint: string;
  api_version: string;
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
  verbosity?: 'low' | 'medium' | 'high';
  previous_response_id?: string;
}

/**
 * Model-agnostic AI caller that handles differences between Lovable AI (Gemini)
 * and OpenAI (GPT-5, O3, etc.) APIs.
 * 
 * CRITICAL: Parameter Support Matrix
 * ===================================
 * 
 * OpenAI Responses API (gpt-5-mini, o3-mini):
 * - ✅ reasoning_effort (minimal, low, medium, high)
 * - ✅ max_output_tokens
 * - ✅ verbosity (low, medium, high)
 * - ❌ temperature (NOT SUPPORTED - causes 400 error)
 * - ❌ seed (NOT SUPPORTED - causes 400 error)
 * 
 * OpenAI Chat Completions API (gpt-4.1-mini):
 * - ✅ temperature (0.0-2.0)
 * - ✅ max_completion_tokens
 * - ✅ seed (for reproducibility)
 * - ❌ reasoning_effort (use temperature instead)
 * 
 * Lovable AI (Gemini 2.5 Flash):
 * - ✅ temperature (0.0-2.0)
 * - ✅ max_tokens
 * - ✅ seed (for reproducibility)
 * - ❌ reasoning_effort (not applicable)
 * 
 * IMPORTANT: Always check model_configurations table for parameter support
 * before including temperature, seed, or reasoning_effort in API calls.
 * 
 * Bug Fix (2025-10-30): Removed temperature/seed from critic-agent to fix
 * 100% failure rate with Responses API models.
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
  const apiVersion = modelConfig.api_version || 'chat_completions';

  // Branch based on API version
  if (apiVersion === 'responses') {
    return callResponsesAPI(modelConfig, params);
  } else {
    return callChatCompletionsAPI(modelConfig, params);
  }
}

/**
 * Handle OpenAI Responses API calls
 * 
 * IMPORTANT: Responses API has a DIFFERENT parameter schema than Chat Completions:
 * - DO NOT include 'temperature' (causes 400 error)
 * - DO NOT include 'seed' (causes 400 error) unless config.supports_seed = true
 * - Use 'reasoning_effort' for deterministic control instead
 * - Max tokens parameter: 'max_output_tokens' (not 'max_completion_tokens')
 * 
 * See: https://platform.openai.com/docs/api-reference/responses
 */
async function callResponsesAPI(config: ModelConfig, params: CallAIParams): Promise<Response> {
  const body: any = {
    model: params.model,
    input: params.messages,
    store: true, // Enable stateful context
  };

  // Extract system message as instructions
  if (params.messages[0]?.role === 'system') {
    body.instructions = params.messages[0].content;
    body.input = params.messages.slice(1);
  }

  // Reference previous response for chaining
  if (params.previous_response_id) {
    body.previous_response_id = params.previous_response_id;
  }

  // Tools (function definitions are flattened)
  if (params.tools) {
    body.tools = params.tools.map((t: any) => {
      if (t.type === 'function' && t.function) {
        return {
          type: 'function',
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters
        };
      }
      return t;
    });
  }

  // Reasoning control (nested object)
  if (params.reasoning_effort) {
    body.reasoning = { effort: params.reasoning_effort };
  }

  // Verbosity control
  body.text = { verbosity: params.verbosity || 'medium' };

  // Max tokens
  if (params.max_output_tokens) {
    body.max_output_tokens = params.max_output_tokens;
  }

  // Seed (for determinism) - ONLY if model explicitly supports it
  // WARNING: Including seed for models that don't support it causes 400 errors
  // Check model_configurations.supports_seed before enabling
  if (config.supports_seed && params.seed !== undefined) {
    body.seed = params.seed;
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch(config.api_endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Responses API error (${response.status}):`, errorText);
    throw new Error(`Responses API error: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Handle Chat Completions API calls (Lovable AI/Gemini and OpenAI GPT-4.1)
 * 
 * This API version supports standard parameters:
 * - temperature (0.0-2.0) for randomness control
 * - seed for reproducibility
 * - max_completion_tokens (OpenAI) or max_tokens (Lovable AI)
 * 
 * Parameter handling is dynamic based on model_configurations table.
 */
async function callChatCompletionsAPI(config: ModelConfig, params: CallAIParams): Promise<Response> {
  const body: any = {
    model: params.model,
    messages: params.messages,
  };

  // Add tools if provided
  if (params.tools) body.tools = params.tools;
  if (params.tool_choice) body.tool_choice = params.tool_choice;

  // Handle temperature vs reasoning_effort
  if (config.supports_temperature && params.temperature !== undefined) {
    body.temperature = params.temperature;
  } else if (config.reasoning_effort_levels && params.reasoning_effort) {
    body.reasoning_effort = params.reasoning_effort;
  }

  // Handle seed for reproducibility
  if (config.supports_seed && params.seed !== undefined) {
    body.seed = params.seed;
  }

  // Handle max tokens parameter naming
  if (params.max_output_tokens) {
    body[config.max_output_tokens_param] = params.max_output_tokens;
  }

  // Determine API key based on endpoint
  const apiKey = config.api_endpoint.includes('lovable') 
    ? Deno.env.get('LOVABLE_API_KEY')
    : Deno.env.get('OPENAI_API_KEY');

  if (!apiKey) {
    throw new Error(`API key not configured for ${config.api_endpoint}`);
  }

  const response = await fetch(config.api_endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Chat Completions API error (${response.status}):`, errorText);
    throw new Error(`Chat Completions API error: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Helper to parse AI response and handle errors
 * Normalizes both Responses API and Chat Completions API formats
 */
export async function parseAIResponse(response: Response, apiVersion: string = 'chat_completions'): Promise<any> {
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`AI returned error: ${JSON.stringify(data.error)}`);
  }

  // Normalize Responses API format to Chat Completions format
  if (apiVersion === 'responses') {
    const messageItem = data.output?.find((i: any) => i.type === 'message');
    const functionCallItems = data.output?.filter((i: any) => i.type === 'function_call') || [];

    return {
      id: data.id,
      choices: [{
        message: {
          role: 'assistant',
          content: data.output_text || messageItem?.content?.[0]?.text || null,
          tool_calls: functionCallItems.length > 0 ? functionCallItems.map((item: any) => ({
            id: item.call_id,
            type: 'function',
            function: {
              name: item.name,
              arguments: item.arguments
            }
          })) : undefined
        }
      }],
      usage: data.usage,
      response_id: data.id // For chaining
    };
  }

  // Chat Completions format (unchanged)
  return data;
}
