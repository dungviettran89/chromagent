/**
 * Type definitions for OpenAI Completion API
 */

// Request parameters for the Completion API
export interface OpenAICompletionCreateParams {
  model: string;
  prompt: string | string[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  logprobs?: number;
  echo?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  best_of?: number;
  logit_bias?: Record<string, number>;
  user?: string;
}

// Response types
export interface OpenAICompletionChoice {
  text: string;
  index: number;
  logprobs: any; // Logprobs object can be complex, using any for flexibility
  finish_reason: string;
}

export interface OpenAICompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAICompletionResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: OpenAICompletionChoice[];
  usage: OpenAICompletionUsage;
}

// Stream response types
export interface OpenAICompletionStreamChoice {
  text: string;
  index: number;
  logprobs: any;
  finish_reason: string | null;
}

export interface OpenAICompletionStreamResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: OpenAICompletionStreamChoice[];
  usage?: OpenAICompletionUsage;
}

// For compatibility with newer OpenAI API, also include Chat Completion types
export interface OpenAIChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  function_call?: any;
  tool_calls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }>;
  tool_call_id?: string;
}

export interface OpenAIChatCompletionCreateParams {
  model: string;
  messages: OpenAIChatCompletionMessageParam[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  functions?: Array<{
    name: string;
    description?: string;
    parameters: object;
  }>;
  function_call?: 'none' | 'auto' | { name: string };
  response_format?: {
    type: 'text' | 'json_object';
  };
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: object;
    };
  }>;
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

export interface OpenAIChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: string;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: OpenAIChatCompletionChoice[];
  usage: OpenAICompletionUsage;
}

// Stream response for chat completions
export interface OpenAIChatCompletionStreamChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string;
  };
  finish_reason: string | null;
}

export interface OpenAIChatCompletionStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: OpenAIChatCompletionStreamChoice[];
}

// Error response
export interface OpenAIAPIError {
  status: number;
  message: string;
  type: string;
}