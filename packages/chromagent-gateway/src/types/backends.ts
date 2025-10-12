// Backend provider types
import { OpenAIChatCompletionCreateParams, OpenAIChatCompletionResponse, OpenAIChatCompletionStreamResponse } from './openai';

export interface BackendConfig {
  // Unique identifier for this backend instance
  id: string;
  
  // Type identifier for the backend
  type: string;
  
  // API key or authentication information
  apiKey: string;
  
  // Base URL for the backend API
  baseUrl?: string;
  
  // Additional headers to include with requests
  additionalHeaders?: Record<string, string>;
  
  // Model mapping: map OpenAI model names to backend-specific names
  modelMapping?: Record<string, string>;
  
  // Custom configuration options for the specific backend
  customConfig?: Record<string, any>;
  
  // Whether this backend is enabled
  enabled: boolean;
  
  // Project ID for Google Cloud services (for Vertex AI)
  projectId?: string;
  
  // Model name for the backend
  model?: string;
}

export interface BackendProvider {
  // Process a non-streaming chat completion request
  chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse>;
  
  // Process a streaming chat completion request
  chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse>;
  
  // Check if the backend supports streaming
  supportsStreaming(): boolean;
  
  // Check if the backend supports tool/function calling
  supportsTools(): boolean;
  
  // Check if the backend supports image inputs
  supportsImages(): boolean;
  
  // Validate the backend configuration
  validateConfig(config: BackendConfig): { valid: boolean; errors: string[] };
}

// Backend-specific types for Vertex Gemini
export interface VertexGeminiRequest {
  contents: VertexContent[];
  systemInstruction?: VertexContent;
  generationConfig?: VertexGenerationConfig;
  safetySettings?: VertexSafetySetting[];
  tools?: VertexTool[];
  toolConfig?: VertexToolConfig;
  model: string;
}

export interface VertexContent {
  role: string;
  parts: VertexPart[];
}

export interface VertexPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args?: any;
  };
  functionResponse?: {
    name: string;
    response: any;
  };
}

export interface VertexGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export interface VertexSafetySetting {
  category: string;
  threshold: string;
}

export interface VertexTool {
  functionDeclarations: VertexFunctionDeclaration[];
}

export interface VertexFunctionDeclaration {
  name: string;
  description: string;
  parameters: any;
}

export interface VertexToolConfig {
  functionCallingConfig: {
    mode: string;
    allowedFunctionNames?: string[];
  };
}

export interface VertexGeminiResponse {
  responseId?: string;
  candidates?: VertexCandidate[];
  usageMetadata?: VertexUsageMetadata;
}

export interface VertexCandidate {
  content: VertexContent;
  finishReason: string;
  index: number;
  safetyRatings: VertexSafetyRating[];
}

export interface VertexSafetyRating {
  category: string;
  probability: string;
}

export interface VertexUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

// Backend-specific types for Vertex Anthropic
export interface VertexAnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessageParam[];
  system?: AnthropicSystemPrompt;
  metadata?: Record<string, string>;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
}

export interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export type AnthropicSystemPrompt = string | AnthropicContentBlock[];

export interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface AnthropicTextContentBlock extends AnthropicContentBlock {
  type: 'text';
  text: string;
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: any;
}

export type AnthropicToolChoice = 
  | { type: 'none' }
  | { type: 'auto' }
  | { type: 'tool', name: string };

export interface AnthropicStreamEvent {
  type: 'message_start' | 'message_delta' | 'message_stop' | 'content_block_start' | 'content_block_delta' | 'content_block_stop';
  message?: AnthropicMessageResponse;
  delta?: AnthropicMessageDelta;
  index: number;
  content_block?: AnthropicContentBlock;
}

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

export interface AnthropicMessageDelta {
  stop_reason: string | null;
  stop_sequence: string | null;
  usage?: AnthropicUsage;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}