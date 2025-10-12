# Ollama API Converter Design

## Overview

This document outlines the design for the Ollama API converter in the chromagent-gateway. This converter will transform OpenAI-compatible requests to Ollama API format and vice versa, ensuring full compatibility between the two APIs.

## Ollama Converter Architecture

### Converter Components

The Ollama converter consists of several key components:

1. **Request Converter**: Transforms OpenAI requests to Ollama format
2. **Response Converter**: Transforms Ollama responses to OpenAI format
3. **Streaming Converter**: Handles streaming responses between formats
4. **Error Converter**: Maps Ollama errors to OpenAI-compatible errors

### Ollama API Endpoints

The converter will interact with the following Ollama endpoints:

- `POST /api/chat` - For both streaming and non-streaming requests (with stream parameter)

## Request Conversion

### OpenAI to Ollama Request Mapping

#### Basic Request Structure

```typescript
// OpenAI format
interface OpenAIChatCompletionCreateParams {
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
  tools?: OpenAIFunction[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

// Ollama format
interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  options?: OllamaOptions;
  stream?: boolean;
  keep_alive?: string | number;
}

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // base64 encoded images
}

interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_ctx?: number;
  max_tokens?: number;
  stop?: string | string[];
}
```

#### Implementation

```typescript
class OllamaRequestConverter {
  // Convert OpenAI request to Ollama format
 convertRequest(openaiRequest: OpenAIChatCompletionCreateParams): OllamaChatRequest {
    const ollamaRequest: OllamaChatRequest = {
      model: this.mapModelName(openaiRequest.model),
      messages: this.convertMessages(openaiRequest.messages),
      stream: openaiRequest.stream || false
    };
    
    // Convert generation options
    ollamaRequest.options = {};
    if (openaiRequest.temperature !== undefined) {
      ollamaRequest.options.temperature = openaiRequest.temperature;
    }
    if (openaiRequest.top_p !== undefined) {
      ollamaRequest.options.top_p = openaiRequest.top_p;
    }
    if (openaiRequest.max_tokens !== undefined) {
      ollamaRequest.options.max_tokens = openaiRequest.max_tokens;
    }
    
    return ollamaRequest;
  }
  
  private convertMessages(messages: OpenAIChatCompletionMessageParam[]): OllamaMessage[] {
    return messages.map(msg => {
      let content = '';
      const images: string[] = [];
      
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') {
            content += item.text;
          } else if (item.type === 'image_url') {
            // Convert image URL to base64
            const base64Image = this.urlToBase64(item.image_url.url);
            images.push(base64Image);
          }
        }
      }
      
      return {
        role: msg.role as 'user' | 'assistant' | 'system',
        content,
        ...(images.length > 0 && { images })
      };
    });
  }
  
  private mapModelName(openaiModel: string): string {
    // Map OpenAI model names to Ollama model names
    // This would be configurable
    const modelMap: Record<string, string> = {
      'gpt-4': 'llama3:latest',
      'gpt-3.5-turbo': 'phi3:latest',
      'gpt-4-vision': 'llava:latest'
      // Add more mappings as needed
    };
    
    return modelMap[openaiModel] || openaiModel;
  }
  
  private async urlToBase64(url: string): Promise<string> {
    if (url.startsWith('data:')) {
      return url.split(',')[1];
    }
    
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  }
}
```

## Response Conversion

### Ollama to OpenAI Response Mapping

```typescript
class OllamaResponseConverter {
 // Convert Ollama response to OpenAI format
  convertResponse(
    ollamaResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: ollamaResponse.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: this.extractUsage(ollamaResponse)
    };
    
    // Convert the response to OpenAI format
    openaiResponse.choices = [{
      index: 0,
      message: {
        role: 'assistant',
        content: ollamaResponse.message?.content || ollamaResponse.response || null
      },
      finish_reason: 'stop'
    }];
    
    return openaiResponse;
  }
  
  private extractUsage(ollamaResponse: any): OpenAIUsage {
    return {
      prompt_tokens: ollamaResponse.prompt_eval_count || 0,
      completion_tokens: ollamaResponse.eval_count || 0,
      total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
    };
  }
}
```

## Streaming Conversion

### Ollama Streaming Response Conversion

```typescript
class OllamaStreamingConverter {
  // Convert Ollama streaming response to OpenAI format
  async *convertStreamingResponse(
    ollamaStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams
 ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    let chunkIndex = 0;
    
    for await (const ollamaChunk of ollamaStream) {
      const openaiChunk = this.convertChunk(ollamaChunk, chunkIndex, originalRequest);
      yield openaiChunk;
      chunkIndex++;
    }
  }
  
  private convertChunk(
    ollamaChunk: any,
    index: number,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionStreamResponse {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: `chatcmpl-${Date.now()}-${index}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        delta: {
          content: ollamaChunk.message?.content || ollamaChunk.response || ''
        },
        finish_reason: ollamaChunk.done ? 'stop' : null
      }]
    };
    
    return openaiChunk;
  }
}
```

## Error Conversion

### Ollama Error to OpenAI Error Mapping

```typescript
class OllamaErrorConverter {
  // Convert Ollama error to OpenAI-compatible error
  convertError(ollamaError: any): { status: number; error: any } {
    let status = 500;
    let error = {
      message: 'An error occurred with the Ollama API',
      type: 'ollama_error',
      code: 'ollama_error'
    };
    
    // Extract error details from Ollama response
    if (ollamaError.error) {
      error = {
        message: ollamaError.error,
        type: 'ollama_error',
        code: 'ollama_request_error'
      };
    } else if (ollamaError.message) {
      error.message = ollamaError.message;
    } else if (typeof ollamaError === 'string') {
      error.message = ollamaError;
    }
    
    return { status, error };
  }
}
```

## Main Ollama Converter Service

### Complete Converter Implementation

```typescript
class OllamaConverter {
  private requestConverter: OllamaRequestConverter;
  private responseConverter: OllamaResponseConverter;
  private streamingConverter: OllamaStreamingConverter;
  private errorConverter: OllamaErrorConverter;
  
  constructor() {
    this.requestConverter = new OllamaRequestConverter();
    this.responseConverter = new OllamaResponseConverter();
    this.streamingConverter = new OllamaStreamingConverter();
    this.errorConverter = new OllamaErrorConverter();
  }
  
  // Convert OpenAI request to Ollama format
  convertRequest(openaiRequest: OpenAIChatCompletionCreateParams): OllamaChatRequest {
    return this.requestConverter.convertRequest(openaiRequest);
  }
  
  // Convert Ollama response to OpenAI format
  convertResponse(
    ollamaResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams
 ): OpenAIChatCompletionResponse {
    return this.responseConverter.convertResponse(ollamaResponse, originalRequest);
  }
  
  // Convert Ollama streaming response to OpenAI format
  async *convertStreamingResponse(
    ollamaStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    yield* this.streamingConverter.convertStreamingResponse(ollamaStream, originalRequest);
  }
  
  // Convert Ollama error to OpenAI-compatible error
 convertError(ollamaError: any): { status: number; error: any } {
    return this.errorConverter.convertError(ollamaError);
  }
  
  // Make API call to Ollama (non-streaming)
  async callNonStreaming(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    try {
      // Convert request
      const ollamaRequest = this.requestConverter.convertRequest(openaiRequest);
      
      // Make API call
      const url = `${config.baseUrl || 'http://localhost:11434'}/api/chat`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...ollamaRequest, stream: false })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.convertError({ ...errorData, status: response.status });
      }
      
      const ollamaResponse = await response.json();
      
      // Convert response
      return this.convertResponse(ollamaResponse, openaiRequest);
    } catch (error) {
      throw this.convertError(error);
    }
 }
  
  // Make API call to Ollama (streaming)
  async *callStreaming(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    try {
      // Convert request with stream=true
      const ollamaRequest = {
        ...this.requestConverter.convertRequest(openaiRequest),
        stream: true
      };
      
      // Make streaming API call
      const url = `${config.baseUrl || 'http://localhost:11434'}/api/chat`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ollamaRequest)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.convertError({ ...errorData, status: response.status });
      }
      
      if (!response.body) {
        throw new Error('No response body for streaming request');
      }
      
      // Process the streaming response (line by line)
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
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            
            try {
              const event = JSON.parse(line);
              
              // Convert and yield the event
              const openaiChunk = this.responseConverter.convertResponse(
                { ...event, responseId: `msg-${Date.now()}` },
                openaiRequest
              );
              
              // Format as stream response
              yield this.formatAsStreamResponse(openaiChunk, event);
              
              if (event.done) break;
            } catch (e) {
              // Skip malformed lines
              continue;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw this.convertError(error);
    }
  }
  
  // Format response as stream chunk
  private formatAsStreamResponse(
    response: OpenAIChatCompletionResponse,
    event?: any
  ): OpenAIChatCompletionStreamResponse {
    return {
      id: response.id,
      object: 'chat.completion.chunk',
      created: response.created,
      model: response.model,
      choices: response.choices.map(choice => ({
        index: choice.index,
        delta: {
          role: 'assistant',
          content: choice.message.content,
        },
        finish_reason: choice.finish_reason
      }))
    };
  }
}
```

## Integration with Backend Provider

### Ollama Backend Provider

```typescript
class OllamaBackendProvider implements BackendProvider {
  private converter: OllamaConverter;
  
  constructor() {
    this.converter = new OllamaConverter();
  }
  
  async chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    return this.converter.callNonStreaming(request, config);
 }
  
  async *chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    yield* this.converter.callStreaming(request, config);
  }
  
  supportsStreaming(): boolean {
    return true;
  }
  
  supportsTools(): boolean {
    return true; // Ollama supports function calling in newer versions
  }
  
  supportsImages(): boolean {
    return true; // Ollama supports vision models
  }
  
  type: BackendType = 'ollama';
}
```

## Configuration and Error Handling

### Configuration Options

The Ollama converter supports the following configuration options:

- Base URL for the Ollama API (defaults to `http://localhost:11434`)
- Model name mapping for different model conventions
- Additional options for Ollama-specific parameters

### Error Handling

The converter provides comprehensive error handling:

- Maps Ollama-specific errors to OpenAI-compatible errors
- Handles HTTP status code mapping
- Provides meaningful error messages
- Maintains error context for debugging

This Ollama API converter provides a complete solution for transforming between OpenAI and Ollama API formats while maintaining full compatibility and feature support.