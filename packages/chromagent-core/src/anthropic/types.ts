/**
 * Type definitions for Anthropic Messages API
 */

// Content types
export type AnthropicContentBlock = AnthropicTextContentBlock | AnthropicImageContentBlock;
export interface AnthropicTextContentBlock {
  type: 'text';
  text: string;
}

export interface AnthropicImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

// Message parameters
export interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

// System prompt types
export type AnthropicSystemPrompt = string | (string | { type: 'text'; text: string })[];

// Tool definitions
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: object;
}

// Request parameters for the Messages API
export interface AnthropicMessageCreateParams {
  model: string;
  max_tokens: number;
  messages: AnthropicMessageParam[];
  system?: AnthropicSystemPrompt;
  metadata?: Record<string, string>;
  model_params?: {
    stop_sequences?: string[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
  };
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: {
    type: 'auto' | 'any' | 'tool';
    name?: string;
  };
  betas?: string[];
}

// Response types
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicTextDelta {
  type: 'text_delta';
  text: string;
}

export interface AnthropicMessageStopEvent {
  type: 'message_stop';
}

export interface AnthropicMessageStartEvent {
  type: 'message_start';
  message: AnthropicMessage;
}

export interface AnthropicContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: AnthropicContentBlock;
}

export interface AnthropicContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: AnthropicTextDelta;
}

export interface AnthropicContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface AnthropicMessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason?: string;
    stop_sequence?: string;
  };
  usage: Partial<AnthropicUsage>;
}

export interface AnthropicMessageStreamEvent {
  type: 'message_start' | 'message_delta' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_stop';
}

export interface AnthropicMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

// Response from the API
export interface AnthropicMessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

// Error response
export interface AnthropicAPIError {
  type: string;
  message: string;
}

// Stream event types
export interface AnthropicStreamEvent {
  type: string;
  [key: string]: any;
}