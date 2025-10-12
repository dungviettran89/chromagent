# Streaming Responses Support Design

## Overview

This document outlines the design for implementing streaming responses in the chromagent-gateway. The gateway must support OpenAI-compatible streaming for the `/v1/chat/completions` endpoint while properly transforming streaming responses from various backend providers.

## Streaming Architecture

### Streaming Pipeline

The streaming implementation follows this pipeline:

```
OpenAI Request (stream: true) → Request Transformer → Backend Request
Backend Stream → Response Transformer → OpenAI Stream → Client
```

### Core Streaming Components

#### 1. Streaming Handler Interface

```typescript
interface StreamingHandler {
  // Handle streaming request to backend and relay to client
  handleStreamingRequest(
    backend: BackendProvider,
    backendRequest: any,
    res: Response
  ): Promise<void>;
  
  // Transform backend stream to OpenAI-compatible stream
 transformStreamToOpenAI(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse>;
}
```

#### 2. Streaming Handler Implementation

```typescript
class StreamingHandlerImpl implements StreamingHandler {
  private transformer: ResponseTransformer;
  
  constructor(transformer: ResponseTransformer) {
    this.transformer = transformer;
  }
  
 async handleStreamingRequest(
    backend: BackendProvider,
    backendRequest: any,
    res: Response
  ): Promise<void> {
    try {
      // Set streaming response headers
      this.setStreamingHeaders(res);
      
      // Get backend stream
      const backendStream = backend.chatCompletionStream(backendRequest);
      
      // Transform and relay stream
      for await (const chunk of this.transformer.transformStreamToOpenAI(
        backendStream,
        res.req.body,
        backend.type
      )) {
        // Send chunk as Server-Sent Events
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      
      // Send end marker
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      this.handleStreamingError(error, res, backend.type);
    }
 }
  
  private setStreamingHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Disable response buffering
    res.setHeader('X-Accel-Buffering', 'no');
  }
  
  private handleStreamingError(
    error: any,
    res: Response,
    backendType: BackendType
  ): void {
    const openaiError = this.transformer.transformErrorToOpenAI(error, backendType);
    
    // Send error as an event
    res.write(`data: ${JSON.stringify({ error: openaiError.error })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
```

## Backend-Specific Streaming Implementations

### 1. Vertex Gemini Streaming

#### Gemini Streaming Response Format

Vertex Gemini returns streaming responses as Server-Sent Events (SE) with JSON payloads:

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "Hello"
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": [...]
    }
 ],
  "usageMetadata": {
    "promptTokenCount": 7,
    "candidatesTokenCount": 10,
    "totalTokenCount": 17
  }
}
```

#### Gemini Streaming Implementation

```typescript
class VertexGeminiStreamingHandler {
  async *handleStreaming(
    request: VertexGeminiRequest,
    config: BackendConfig
  ): AsyncIterable<VertexGeminiResponse> {
    const url = `${config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${request.model}:streamGenerateContent?key=${config.apiKey}`;
    
    // Prepare the request body
    const requestBody = JSON.stringify(request);
    
    // Make streaming request using fetch
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.additionalHeaders
      },
      body: requestBody
    });
    
    if (!response.body) {
      throw new Error('No response body for streaming request');
    }
    
    // Process the streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines (Gemini sends multiple JSON objects per response)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            // Remove "data: " prefix if present
            const jsonStr = line.startsWith('data: ') ? line.substring(6) : line;
            if (jsonStr.trim() === '[DONE]') continue;
            
            const parsed = JSON.parse(jsonStr);
            yield parsed;
          } catch (e) {
            // Skip malformed lines
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

### 2. Vertex Anthropic Streaming

#### Anthropic Streaming Response Format

Vertex Anthropic uses event-based streaming with different event types:

```json
{
 "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "text",
    "text": ""
 }
}
```

```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "text_delta",
    "text": "Hello"
  }
}
```

#### Anthropic Streaming Implementation

```typescript
class VertexAnthropicStreamingHandler {
  async *handleStreaming(
    request: VertexAnthropicRequest,
    config: BackendConfig
  ): AsyncIterable<AnthropicStreamEvent> {
    // Add stream parameter
    const streamRequest = { ...request, stream: true };
    
    const url = `${config.baseUrl || 'https://us-central1-aiplatform.googleapis.com/v1'}/projects/${config.projectId || 'my-project'}/locations/us-central1/publishers/anthropic/models/${config.model || 'claude-3-5-sonnet'}:generateContent`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'vertex-2023-10-16',
        ...config.additionalHeaders
      },
      body: JSON.stringify(streamRequest)
    });
    
    if (!response.body) {
      throw new Error('No response body for streaming request');
    }
    
    // Process Server-Sent Events
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              if (jsonStr.trim() === '[DONE]') continue;
              
              const parsed = JSON.parse(jsonStr);
              yield parsed;
            } catch (e) {
              // Skip malformed lines
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

## OpenAI-Compatible Streaming Format

### Streaming Response Structure

The gateway must return streaming responses in OpenAI format:

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
        name?: string;
        arguments?: string;
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

### Streaming Transformation Logic

```typescript
class StreamingTransformer {
  async *transformToOpenAIFormat(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    let chunkIndex = 0;
    
    for await (const backendChunk of backendStream) {
      const openaiChunk = this.transformChunk(
        backendChunk,
        chunkIndex,
        originalRequest,
        backendType
      );
      
      yield openaiChunk;
      chunkIndex++;
    }
  }
  
  private transformChunk(
    backendChunk: any,
    index: number,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionStreamResponse {
    const baseResponse: OpenAIChatCompletionStreamResponse = {
      id: backendChunk.id || `chatcmpl-${Date.now()}-${index}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: []
    };
    
    switch (backendType) {
      case 'vertex-gemini':
        baseResponse.choices = this.transformVertexGeminiChunk(backendChunk, index);
        break;
        
      case 'vertex-anthropic':
        baseResponse.choices = this.transformVertexAnthropicChunk(backendChunk, index);
        break;
        
      default:
        // For unsupported backends, return empty choices
        baseResponse.choices = [{
          index,
          delta: {},
          finish_reason: null
        }];
    }
    
    return baseResponse;
  }
  
  private transformVertexGeminiChunk(
    chunk: any,
    index: number
  ): Array<{
    index: number;
    delta: any;
    finish_reason: string | null;
  }> {
    if (!chunk.candidates || chunk.candidates.length === 0) {
      return [{
        index,
        delta: {},
        finish_reason: null
      }];
    }
    
    return chunk.candidates.map((candidate: any, candidateIndex: number) => {
      const delta: any = {};
      
      // Extract text content from parts
      if (candidate.content?.parts) {
        const textPart = candidate.content.parts.find((part: any) => part.text);
        if (textPart && textPart.text) {
          delta.content = textPart.text;
        }
      }
      
      // Add role if not present
      if (!delta.role) {
        delta.role = 'assistant';
      }
      
      return {
        index: candidateIndex,
        delta,
        finish_reason: this.mapVertexGeminiFinishReason(candidate.finishReason)
      };
    });
  }
  
 private transformVertexAnthropicChunk(
    chunk: any,
    index: number
 ): Array<{
    index: number;
    delta: any;
    finish_reason: string | null;
  }> {
    const delta: any = {};
    let finish_reason: string | null = null;
    
    switch (chunk.type) {
      case 'content_block_start':
        delta.role = 'assistant';
        if (chunk.content_block?.text) {
          delta.content = chunk.content_block.text;
        }
        break;
        
      case 'content_block_delta':
        if (chunk.delta?.text) {
          delta.content = chunk.delta.text;
        }
        break;
        
      case 'message_delta':
        finish_reason = this.mapAnthropicFinishReason(chunk.delta?.stop_reason);
        // Add usage information if available
        if (chunk.usage) {
          // This would be handled at the response level, not chunk level
        }
        break;
        
      case 'message_stop':
        finish_reason = 'stop';
        break;
        
      case 'content_block_stop':
        // Content block finished, but message may continue
        break;
    }
    
    return [{
      index,
      delta,
      finish_reason
    }];
  }
  
  private mapVertexGeminiFinishReason(finishReason: string | undefined): string | null {
    if (!finishReason) return null;
    
    const mapping: Record<string, string> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    
    return mapping[finishReason] || 'stop';
  }
  
 private mapAnthropicFinishReason(finishReason: string | undefined): string | null {
    if (!finishReason) return null;
    
    const mapping: Record<string, string> = {
      'stop_sequence': 'stop',
      'max_tokens': 'length',
      'end_turn': 'stop',
      'tool_use': 'tool_calls'
    };
    
    return mapping[finishReason] || 'stop';
  }
}
```

## Streaming Error Handling

### Error Transformation During Streaming

```typescript
class StreamingErrorHandler {
  handleBackendError(
    error: any,
    backendType: BackendType
  ): OpenAIChatCompletionStreamResponse {
    const errorResponse: OpenAIChatCompletionStreamResponse = {
      id: `error-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'unknown',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'content_filter' // or appropriate error reason
      }],
      error: this.transformBackendError(error, backendType)
    };
    
    return errorResponse;
  }
  
  private transformBackendError(error: any, backendType: BackendType): any {
    // Transform backend-specific error to OpenAI-compatible error
    switch (backendType) {
      case 'vertex-gemini':
        return {
          message: error.message || 'Vertex Gemini API error',
          type: 'vertex_error',
          code: error.code
        };
        
      case 'vertex-anthropic':
        return {
          message: error.message || 'Vertex Anthropic API error',
          type: 'anthropic_error',
          code: error.type
        };
        
      default:
        return {
          message: error.message || 'Backend API error',
          type: 'backend_error',
          code: 'backend_error'
        };
    }
  }
}
```

## Performance Considerations

### 1. Memory Management

- Use generators to avoid buffering entire streams
- Proper cleanup of stream readers
- Efficient string handling for large responses

```typescript
class StreamingMemoryManager {
  private maxBufferSize = 1024 * 1024; // 1MB
  
  // Monitor buffer size to prevent memory issues
  validateBufferSize(buffer: string): boolean {
    return Buffer.byteLength(buffer, 'utf8') < this.maxBufferSize;
  }
  
  // Implement backpressure if needed
  async handleBackpressure(): Promise<void> {
    // Add delay to prevent overwhelming the client
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
```

### 2. Connection Management

- Proper handling of client disconnections
- Cleanup resources when streams are cancelled
- Timeout handling for stalled streams

```typescript
class ConnectionManager {
  private activeConnections = new Map<string, AbortController>();
  
  createConnection(id: string): AbortController {
    const controller = new AbortController();
    this.activeConnections.set(id, controller);
    return controller;
  }
  
  disconnect(id: string): void {
    const controller = this.activeConnections.get(id);
    if (controller) {
      controller.abort();
      this.activeConnections.delete(id);
    }
  }
  
  cleanup(): void {
    for (const [id, controller] of this.activeConnections) {
      controller.abort();
    }
    this.activeConnections.clear();
 }
}
```

## Client-Side Considerations

### 1. Event Stream Format

The gateway must return data in the correct Server-Sent Events format:

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk",...}

data: {"id":"chatcmpl-124","object":"chat.completion.chunk",...}

data: [DONE]
```

### 2. Header Requirements

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `Access-Control-Allow-Origin: *` (for CORS)
- `X-Accel-Buffering: no` (to prevent proxy buffering)

## Testing Strategy

### 1. Unit Tests

- Test chunk transformation logic
- Test error handling during streaming
- Test different backend response formats

### 2. Integration Tests

- Test complete streaming flow from client to backend and back
- Test connection interruption handling
- Test large response handling

### 3. Performance Tests

- Test memory usage during long streams
- Test response time under load
- Test concurrent stream handling

This streaming implementation provides a robust foundation for handling OpenAI-compatible streaming responses while properly transforming them from various backend providers.