# OpenAI-Compatible Types and Interfaces Design

## Overview

This document details the type definitions that will be used in the chromagent-gateway package to ensure compatibility with the OpenAI API. These types will serve as the foundation for request/response transformation between OpenAI format and various backend formats.

## OpenAI Chat Completions Request Types

### Main Request Interface

```typescript
interface OpenAIChatCompletionCreateParams {
  messages: OpenAIChatCompletionMessageParam[];
  model: string;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  max_tokens?: number;
  n?: number;
  presence_penalty?: number;
 response_format?: {
    type: 'text' | 'json_object';
  };
  seed?: number;
  stop?: string | string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
 tools?: OpenAIFunction[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
  user?: string;
}
```

### Message Types

```typescript
interface OpenAIChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
      detail?: 'auto' | 'low' | 'high';
    };
  }>;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
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
```

### Function/Tool Types

```typescript
interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}
```

## OpenAI Chat Completions Response Types

### Non-Streaming Response

```typescript
interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
 choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      function_call?: {
        name: string;
        arguments: string;
      };
      tool_calls?: Array<{
        id: string;
        function: {
          name: string;
          arguments: string;
        };
        type: 'function';
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### Streaming Response

```typescript
interface OpenAIChatCompletionStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
 choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      function_call?: {
        name: string;
        arguments: string;
      };
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
        type?: 'function';
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;
  }>;
}
```

## Backend Provider Types

### Base Backend Interface

```typescript
interface BackendProvider {
  // Process a chat completion request
  chatCompletion(request: OpenAIChatCompletionCreateParams): Promise<OpenAIChatCompletionResponse>;
  
  // Process a streaming chat completion request
  chatCompletionStream(request: OpenAIChatCompletionCreateParams): AsyncIterable<OpenAIChatCompletionStreamResponse>;
  
  // Validate if the backend supports specific features
  supportsStreaming(): boolean;
  supportsTools(): boolean;
 supportsImages(): boolean;
}
```

### Backend-Specific Request/Response Types

For each backend provider, we'll define specific request and response types:

#### Vertex Gemini Types

```typescript
interface VertexGeminiRequest {
  contents: VertexContent[];
  systemInstruction?: VertexContent;
  generationConfig?: VertexGenerationConfig;
  safetySettings?: VertexSafetySetting[];
  tools?: VertexTool[];
  toolConfig?: VertexToolConfig;
}

interface VertexGeminiResponse {
  candidates?: VertexCandidate[];
  usageMetadata?: VertexUsageMetadata;
}
```

#### Vertex Anthropic Types

```typescript
interface VertexAnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessageParam[];
  system?: AnthropicSystemPrompt;
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  stream?: boolean;
}

interface VertexAnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}
```

## Request/Response Transformers

### Request Transformer Interface

```typescript
interface RequestTransformer {
  // Convert OpenAI request to backend-specific request
  transformToBackend(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): any; // Returns backend-specific request format
  
  // Convert backend-specific request back to OpenAI format (for logging/debugging)
  transformFromBackend(
    backendRequest: any,
    backendType: BackendType
  ): OpenAIChatCompletionCreateParams;
}
```

### Response Transformer Interface

```typescript
interface ResponseTransformer {
  // Convert backend response to OpenAI-compatible response
  transformToOpenAI(
    backendResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionResponse;
  
  // Convert backend streaming response to OpenAI-compatible streaming response
  transformStreamToOpenAI(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse>;
}
```

## Token Usage Tracking

### Token Counter Interface

```typescript
interface TokenCounter {
  // Count tokens in a text string
  countTokens(text: string): number;
  
  // Count tokens in a message
  countMessageTokens(message: OpenAIChatCompletionMessageParam): number;
  
  // Count tokens in a conversation
  countConversationTokens(messages: OpenAIChatCompletionMessageParam[]): number;
  
  // Map backend token counts to OpenAI format
  mapTokenCounts(backendUsage: any, backendType: BackendType): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

## Image Handling Types

### Image Processing Interface

```typescript
interface ImageProcessor {
  // Convert image URL to base64 data URL
  urlToBase64(url: string): Promise<string>;
  
  // Extract image data from OpenAI message format
  extractImageData(message: OpenAIChatCompletionMessageParam): Array<{
    type: 'image_url';
    image_url: {
      url: string;
      detail: 'auto' | 'low' | 'high';
    };
  }>;
  
  // Convert OpenAI image format to backend-specific format
  convertToBackendFormat(
    imageData: Array<{ url: string; detail: string }>,
    backendType: BackendType
  ): any; // Returns backend-specific image format
}
```

## Streaming Handler Types

### Streaming Interface

```typescript
interface StreamingHandler {
  // Handle streaming response from backend and convert to OpenAI format
  handleStreamingResponse(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse>;
  
  // Convert streaming chunks between formats
  convertStreamChunk(
    chunk: any,
    index: number,
    backendType: BackendType
  ): OpenAIChatCompletionStreamResponse;
}
```

## Error Handling Types

### Error Transformation Interface

```typescript
interface ErrorTransformer {
  // Convert backend-specific error to OpenAI-compatible error
  transformBackendError(
    backendError: any,
    backendType: BackendType
  ): {
    status: number;
    error: {
      message: string;
      type: string;
      code?: string;
    };
  };
}
```

## Configuration Types

### Gateway Configuration

```typescript
interface GatewayConfig {
  // Default backend provider
  defaultBackend: BackendType;
  
  // Backend provider configurations
  backends: Record<BackendType, BackendConfig>;
  
  // Port for the gateway server
  port: number;
  
  // CORS settings
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  
  // Rate limiting settings
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  
  // Timeout settings
  timeout: number;
}

interface BackendConfig {
  apiKey: string;
  baseUrl?: string;
  additionalHeaders?: Record<string, string>;
  modelMapping?: Record<string, string>; // Map OpenAI model names to backend-specific names
}
```

## Implementation Strategy

The type definitions will be implemented in the following files:

1. `src/types/openai.ts` - OpenAI-compatible types
2. `src/types/backends.ts` - Backend provider types
3. `src/types/gateway.ts` - Gateway-specific types
4. `src/types/transformers.ts` - Transformer interfaces
5. `src/types/utils.ts` - Utility types (token counting, image processing, etc.)

These types will ensure type safety throughout the gateway implementation and provide a clear contract for the various components of the system.