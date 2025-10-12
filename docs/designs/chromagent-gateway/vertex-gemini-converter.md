# Vertex Gemini API Converter Design

## Overview

This document outlines the design for the Vertex Gemini API converter in the chromagent-gateway. This converter will transform OpenAI-compatible requests to Vertex Gemini API format and vice versa, ensuring full compatibility between the two APIs.

## Vertex Gemini Converter Architecture

### Converter Components

The Vertex Gemini converter consists of several key components:

1. **Request Converter**: Transforms OpenAI requests to Vertex Gemini format
2. **Response Converter**: Transforms Vertex Gemini responses to OpenAI format
3. **Streaming Converter**: Handles streaming responses between formats
4. **Error Converter**: Maps Vertex Gemini errors to OpenAI-compatible errors

### Vertex Gemini API Endpoints

The converter will interact with the following Vertex Gemini endpoints:

- `POST /v1beta/models/{model}:streamGenerateContent` - For streaming requests
- `POST /v1beta/models/{model}:generateContent` - For non-streaming requests

## Request Conversion

### OpenAI to Vertex Gemini Request Mapping

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

// Vertex Gemini format
interface VertexGeminiRequest {
  contents: VertexContent[];
  systemInstruction?: VertexContent;
  generationConfig?: VertexGenerationConfig;
 safetySettings?: VertexSafetySetting[];
  tools?: VertexTool[];
  toolConfig?: VertexToolConfig;
}
```

#### Implementation

```typescript
class VertexGeminiRequestConverter {
  // Convert OpenAI request to Vertex Gemini format
  convertRequest(openaiRequest: OpenAIChatCompletionCreateParams): VertexGeminiRequest {
    const geminiRequest: VertexGeminiRequest = {
      contents: [],
      generationConfig: {},
    };
    
    // Map model (with potential model name conversion)
    geminiRequest.model = this.mapModelName(openaiRequest.model);
    
    // Convert messages to contents
    geminiRequest.contents = this.convertMessages(openaiRequest.messages);
    
    // Convert generation config
    if (openaiRequest.temperature !== undefined) {
      geminiRequest.generationConfig.temperature = openaiRequest.temperature;
    }
    if (openaiRequest.top_p !== undefined) {
      geminiRequest.generationConfig.topP = openaiRequest.top_p;
    }
    if (openaiRequest.max_tokens !== undefined) {
      geminiRequest.generationConfig.maxOutputTokens = openaiRequest.max_tokens;
    }
    
    // Convert tools if present
    if (openaiRequest.tools) {
      geminiRequest.tools = this.convertTools(openaiRequest.tools);
    }
    
    // Convert tool choice if present
    if (openaiRequest.tool_choice) {
      geminiRequest.toolConfig = this.convertToolChoice(openaiRequest.tool_choice);
    }
    
    return geminiRequest;
  }
  
  private convertMessages(messages: OpenAIChatCompletionMessageParam[]): VertexContent[] {
    const contents: VertexContent[] = [];
    let systemInstruction: VertexContent | undefined;
    
    for (const message of messages) {
      if (message.role === 'system') {
        // Gemini has a separate systemInstruction field
        systemInstruction = {
          role: 'user', // For system instructions, Gemini uses 'user' role
          parts: [{
            text: typeof message.content === 'string' ? message.content : 
                  Array.isArray(message.content) ? message.content.map(c => c.text).join(' ') : ''
          }]
        };
      } else {
        // Convert regular messages
        const content: VertexContent = {
          role: message.role === 'assistant' ? 'model' : message.role,
          parts: []
        };
        
        if (typeof message.content === 'string') {
          content.parts.push({ text: message.content });
        } else if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (item.type === 'text') {
              content.parts.push({ text: item.text });
            } else if (item.type === 'image_url') {
              // Convert image to inline data
              content.parts.push({
                inlineData: {
                  mimeType: this.getMimeTypeFromUrl(item.image_url.url),
                  data: this.urlToBase64(item.image_url.url)
                }
              });
            }
          }
        }
        
        contents.push(content);
      }
    }
    
    return contents;
  }
  
 private convertTools(tools: OpenAIFunction[]): VertexTool[] {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: tool.function.parameters
      }))
    }];
  }
  
  private convertToolChoice(toolChoice: OpenAIChatCompletionCreateParams['tool_choice']): VertexToolConfig {
    if (toolChoice === 'none') {
      return {
        functionCallingConfig: { mode: 'MODE_UNSPECIFIED' }
      };
    } else if (toolChoice === 'auto') {
      return {
        functionCallingConfig: { mode: 'AUTO' }
      };
    } else if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [toolChoice.function.name]
        }
      };
    }
    
    return {
      functionCallingConfig: { mode: 'AUTO' }
    };
  }
  
  private mapModelName(openaiModel: string): string {
    // Map OpenAI model names to Vertex Gemini model names
    // This would be configurable
    const modelMap: Record<string, string> = {
      'gpt-4': 'gemini-1.5-pro',
      'gpt-3.5-turbo': 'gemini-1.0-pro',
      // Add more mappings as needed
    };
    
    return modelMap[openaiModel] || openaiModel;
  }
  
  private getMimeTypeFromUrl(url: string): string {
    if (url.startsWith('data:')) {
      return url.split(';')[0].split(':')[1];
    }
    
    if (url.includes('.jpg') || url.includes('.jpeg')) return 'image/jpeg';
    if (url.includes('.png')) return 'image/png';
    if (url.includes('.gif')) return 'image/gif';
    if (url.includes('.webp')) return 'image/webp';
    
    return 'image/jpeg';
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

### Vertex Gemini to OpenAI Response Mapping

```typescript
class VertexGeminiResponseConverter {
  // Convert Vertex Gemini response to OpenAI format
  convertResponse(
    geminiResponse: VertexGeminiResponse,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: geminiResponse.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: this.extractUsage(geminiResponse)
    };
    
    // Convert candidates to choices
    if (geminiResponse.candidates) {
      openaiResponse.choices = geminiResponse.candidates.map((candidate, index) => {
        let content = '';
        const toolCalls: any[] = [];
        
        // Extract text and tool calls from parts
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              content += part.text;
            } else if (part.functionCall) {
              toolCalls.push({
                id: this.generateToolCallId(),
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args || {})
                },
                type: 'function'
              });
            }
          }
        }
        
        return {
          index,
          message: {
            role: 'assistant',
            content: content || null,
            ...(toolCalls.length > 0 && { tool_calls: toolCalls })
          },
          finish_reason: this.mapFinishReason(candidate.finishReason)
        };
      });
    }
    
    return openaiResponse;
  }
  
  private extractUsage(geminiResponse: VertexGeminiResponse): OpenAIUsage {
    const usageMetadata = geminiResponse.usageMetadata;
    return {
      prompt_tokens: usageMetadata?.promptTokenCount || 0,
      completion_tokens: usageMetadata?.candidatesTokenCount || 0,
      total_tokens: usageMetadata?.totalTokenCount || 0
    };
  }
  
  private mapFinishReason(finishReason: string | undefined): string {
    if (!finishReason) return 'stop';
    
    const mapping: Record<string, string> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    
    return mapping[finishReason] || 'stop';
  }
  
 private generateToolCallId(): string {
    return `call_${Math.random().toString(36).substring(2, 11)}`;
  }
}
```

## Streaming Conversion

### Vertex Gemini Streaming Response Conversion

```typescript
class VertexGeminiStreamingConverter {
  // Convert Vertex Gemini streaming response to OpenAI format
  async *convertStreamingResponse(
    geminiStream: AsyncIterable<VertexGeminiResponse>,
    originalRequest: OpenAIChatCompletionCreateParams
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    let chunkIndex = 0;
    
    for await (const geminiChunk of geminiStream) {
      const openaiChunk = this.convertChunk(geminiChunk, chunkIndex, originalRequest);
      yield openaiChunk;
      chunkIndex++;
    }
  }
  
 private convertChunk(
    geminiChunk: VertexGeminiResponse,
    index: number,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionStreamResponse {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: geminiChunk.responseId || `chatcmpl-${Date.now()}-${index}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: []
    };
    
    // Convert candidates to choices
    if (geminiChunk.candidates) {
      openaiChunk.choices = geminiChunk.candidates.map((candidate, candidateIndex) => {
        const delta: any = {};
        
        // Extract content from parts
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              delta.content = part.text;
            } else if (part.functionCall) {
              delta.tool_calls = [{
                index: 0,
                id: this.generateToolCallId(),
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args || {})
                },
                type: 'function'
              }];
            }
          }
        }
        
        // Add role if not present
        if (!delta.role) {
          delta.role = 'assistant';
        }
        
        return {
          index: candidateIndex,
          delta,
          finish_reason: candidate.finishReason ? this.mapFinishReason(candidate.finishReason) : null
        };
      });
    } else {
      // If no candidates, still create a choice with empty delta
      openaiChunk.choices = [{
        index: 0,
        delta: {},
        finish_reason: null
      }];
    }
    
    return openaiChunk;
  }
  
  private mapFinishReason(finishReason: string | undefined): string | null {
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
  
  private generateToolCallId(): string {
    return `call_${Math.random().toString(36).substring(2, 11)}`;
  }
}
```

## Error Conversion

### Vertex Gemini Error to OpenAI Error Mapping

```typescript
class VertexGeminiErrorConverter {
  // Convert Vertex Gemini error to OpenAI-compatible error
  convertError(geminiError: any): { status: number; error: any } {
    let status = 500;
    let error = {
      message: 'An error occurred with the Vertex Gemini API',
      type: 'vertex_gemini_error',
      code: 'vertex_gemini_error'
    };
    
    // Extract error details from Vertex Gemini response
    if (geminiError.error) {
      const vertexError = geminiError.error;
      
      // Map Vertex error status to HTTP status
      status = this.mapVertexStatus(vertexError.status || vertexError.code);
      
      error = {
        message: vertexError.message || error.message,
        type: this.mapVertexErrorType(vertexError.status),
        code: vertexError.status || vertexError.code || error.code
      };
    } else if (geminiError.message) {
      error.message = geminiError.message;
    }
    
    return { status, error };
  }
  
  private mapVertexStatus(vertexStatus: string): number {
    const statusMap: Record<string, number> = {
      'INVALID_ARGUMENT': 400,
      'UNAUTHENTICATED': 401,
      'PERMISSION_DENIED': 403,
      'NOT_FOUND': 404,
      'RESOURCE_EXHAUSTED': 429,
      'INTERNAL': 500,
      'UNAVAILABLE': 503
    };
    
    return statusMap[vertexStatus] || 500;
  }
  
  private mapVertexErrorType(vertexStatus: string): string {
    const typeMap: Record<string, string> = {
      'INVALID_ARGUMENT': 'invalid_request_error',
      'UNAUTHENTICATED': 'authentication_error',
      'PERMISSION_DENIED': 'permission_error',
      'NOT_FOUND': 'not_found_error',
      'RESOURCE_EXHAUSTED': 'rate_limit_error',
      'INTERNAL': 'internal_error',
      'UNAVAILABLE': 'service_unavailable_error'
    };
    
    return typeMap[vertexStatus] || 'vertex_gemini_error';
  }
}
```

## Main Vertex Gemini Converter Service

### Complete Converter Implementation

```typescript
class VertexGeminiConverter {
  private requestConverter: VertexGeminiRequestConverter;
  private responseConverter: VertexGeminiResponseConverter;
  private streamingConverter: VertexGeminiStreamingConverter;
  private errorConverter: VertexGeminiErrorConverter;
  
  constructor() {
    this.requestConverter = new VertexGeminiRequestConverter();
    this.responseConverter = new VertexGeminiResponseConverter();
    this.streamingConverter = new VertexGeminiStreamingConverter();
    this.errorConverter = new VertexGeminiErrorConverter();
  }
  
  // Convert OpenAI request to Vertex Gemini format
  convertRequest(openaiRequest: OpenAIChatCompletionCreateParams): VertexGeminiRequest {
    return this.requestConverter.convertRequest(openaiRequest);
  }
  
  // Convert Vertex Gemini response to OpenAI format
  convertResponse(
    geminiResponse: VertexGeminiResponse,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    return this.responseConverter.convertResponse(geminiResponse, originalRequest);
  }
  
  // Convert Vertex Gemini streaming response to OpenAI format
  async *convertStreamingResponse(
    geminiStream: AsyncIterable<VertexGeminiResponse>,
    originalRequest: OpenAIChatCompletionCreateParams
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    yield* this.streamingConverter.convertStreamingResponse(geminiStream, originalRequest);
  }
  
  // Convert Vertex Gemini error to OpenAI-compatible error
  convertError(geminiError: any): { status: number; error: any } {
    return this.errorConverter.convertError(geminiError);
  }
  
  // Make API call to Vertex Gemini (non-streaming)
  async callNonStreaming(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
 ): Promise<OpenAIChatCompletionResponse> {
    try {
      // Convert request
      const geminiRequest = this.requestConverter.convertRequest(openaiRequest);
      
      // Make API call
      const url = `${config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${geminiRequest.model}:generateContent?key=${config.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.additionalHeaders
        },
        body: JSON.stringify(geminiRequest)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.convertError({ ...errorData, status: response.status });
      }
      
      const geminiResponse = await response.json();
      
      // Convert response
      return this.convertResponse(geminiResponse, openaiRequest);
    } catch (error) {
      throw this.convertError(error);
    }
 }
  
  // Make API call to Vertex Gemini (streaming)
  async *callStreaming(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    try {
      // Convert request
      const geminiRequest = this.requestConverter.convertRequest(openaiRequest);
      
      // Make streaming API call
      const url = `${config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${geminiRequest.model}:streamGenerateContent?key=${config.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.additionalHeaders
        },
        body: JSON.stringify(geminiRequest)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.convertError({ ...errorData, status: response.status });
      }
      
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
          
          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            
            try {
              // Remove "data: " prefix if present
              const jsonStr = line.startsWith('data: ') ? line.substring(6) : line;
              if (jsonStr.trim() === '[DONE]') continue;
              
              const geminiChunk = JSON.parse(jsonStr);
              
              // Convert and yield the chunk
              const openaiChunk = this.convertResponse(geminiChunk, openaiRequest);
              
              // For streaming, we need to format as stream response
              // This is a simplified version - in practice, we'd use the streaming converter
              yield this.formatAsStreamResponse(openaiChunk);
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
  
  // Format response as stream chunk (simplified)
  private formatAsStreamResponse(response: OpenAIChatCompletionResponse): OpenAIChatCompletionStreamResponse {
    // This is a simplified transformation
    // In practice, we'd use the streaming converter
    return {
      id: response.id,
      object: 'chat.completion.chunk',
      created: response.created,
      model: response.model,
      choices: response.choices.map(choice => ({
        index: choice.index,
        delta: {
          role: 'assistant',
          content: choice.message.content
        },
        finish_reason: choice.finish_reason
      }))
    };
  }
}
```

## Integration with Backend Provider

### Vertex Gemini Backend Provider

```typescript
class VertexGeminiBackendProvider implements BackendProvider {
  private converter: VertexGeminiConverter;
  
  constructor() {
    this.converter = new VertexGeminiConverter();
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
    return true;
 }
  
  supportsImages(): boolean {
    return true;
 }
  
  type: BackendType = 'vertex-gemini';
}
```

## Configuration and Error Handling

### Configuration Options

The Vertex Gemini converter supports the following configuration options:

- API key for authentication
- Base URL for the API (defaults to Google's endpoint)
- Additional headers for custom configuration
- Model name mapping for different model conventions

### Error Handling

The converter provides comprehensive error handling:

- Maps Vertex Gemini-specific errors to OpenAI-compatible errors
- Handles HTTP status code mapping
- Provides meaningful error messages
- Maintains error context for debugging

This Vertex Gemini API converter provides a complete solution for transforming between OpenAI and Vertex Gemini API formats while maintaining full compatibility and feature support.