# Vertex Anthropic API Converter Design

## Overview

This document outlines the design for the Vertex Anthropic API converter in the chromagent-gateway. This converter will transform OpenAI-compatible requests to Vertex Anthropic API format and vice versa, ensuring full compatibility between the two APIs.

## Vertex Anthropic Converter Architecture

### Converter Components

The Vertex Anthropic converter consists of several key components:

1. **Request Converter**: Transforms OpenAI requests to Vertex Anthropic format
2. **Response Converter**: Transforms Vertex Anthropic responses to OpenAI format
3. **Streaming Converter**: Handles streaming responses between formats
4. **Error Converter**: Maps Vertex Anthropic errors to OpenAI-compatible errors

### Vertex Anthropic API Endpoints

The converter will interact with the following Vertex Anthropic endpoints:

- `POST /v1/messages` - For both streaming and non-streaming requests (with stream parameter)

## Request Conversion

### OpenAI to Vertex Anthropic Request Mapping

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

// Vertex Anthropic format
interface VertexAnthropicRequest {
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
```

#### Implementation

```typescript
class VertexAnthropicRequestConverter {
  // Convert OpenAI request to Vertex Anthropic format
 convertRequest(openaiRequest: OpenAIChatCompletionCreateParams): VertexAnthropicRequest {
    const anthropicRequest: VertexAnthropicRequest = {
      model: this.mapModelName(openaiRequest.model),
      max_tokens: openaiRequest.max_tokens || 1024, // Default max tokens
      messages: [],
      stream: openaiRequest.stream || false
    };
    
    // Convert temperature and top_p if provided
    if (openaiRequest.temperature !== undefined) {
      anthropicRequest.temperature = openaiRequest.temperature;
    }
    if (openaiRequest.top_p !== undefined) {
      anthropicRequest.top_p = openaiRequest.top_p;
    }
    
    // Convert tools if present
    if (openaiRequest.tools) {
      anthropicRequest.tools = this.convertTools(openaiRequest.tools);
    }
    
    // Convert tool choice if present
    if (openaiRequest.tool_choice) {
      anthropicRequest.tool_choice = this.convertToolChoice(openaiRequest.tool_choice);
    }
    
    // Convert messages, separating system messages
    const { messages, systemPrompt } = this.convertMessages(openaiRequest.messages);
    anthropicRequest.messages = messages;
    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }
    
    return anthropicRequest;
  }
  
  private convertMessages(messages: OpenAIChatCompletionMessageParam[]): {
    messages: AnthropicMessageParam[];
    systemPrompt: string | undefined;
  } {
    const anthropicMessages: AnthropicMessageParam[] = [];
    let systemPrompt: string | undefined;
    
    for (const message of messages) {
      if (message.role === 'system') {
        // Anthropic has a separate system field
        if (typeof message.content === 'string') {
          systemPrompt = message.content;
        } else if (Array.isArray(message.content)) {
          systemPrompt = message.content
            .filter(item => item.type === 'text')
            .map(item => (item as any).text)
            .join(' ');
        }
      } else {
        // Convert regular messages
        const anthropicMessage: AnthropicMessageParam = {
          role: message.role as 'user' | 'assistant',
          content: []
        };
        
        if (typeof message.content === 'string') {
          anthropicMessage.content = message.content;
        } else if (Array.isArray(message.content)) {
          const contentBlocks: AnthropicContentBlock[] = [];
          
          for (const item of message.content) {
            if (item.type === 'text') {
              contentBlocks.push({
                type: 'text',
                text: item.text
              });
            } else if (item.type === 'image_url') {
              // Convert image to base64 format for Anthropic
              contentBlocks.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: this.getMediaTypeFromUrl(item.image_url.url),
                  data: this.urlToBase64(item.image_url.url)
                }
              });
            }
          }
          
          anthropicMessage.content = contentBlocks;
        } else {
          // Handle null content (e.g., for tool responses)
          anthropicMessage.content = message.content || '';
        }
        
        anthropicMessages.push(anthropicMessage);
      }
    }
    
    return { messages: anthropicMessages, systemPrompt };
  }
  
  private convertTools(openaiTools: OpenAIFunction[]): AnthropicTool[] {
    return openaiTools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }));
  }
  
  private convertToolChoice(toolChoice: OpenAIChatCompletionCreateParams['tool_choice']): AnthropicToolChoice | undefined {
    if (!toolChoice) return undefined;
    
    if (toolChoice === 'none') {
      return { type: 'none' };
    } else if (toolChoice === 'auto') {
      return { type: 'auto' };
    } else if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return {
        type: 'tool',
        name: toolChoice.function.name
      };
    }
    
    return undefined;
  }
  
  private mapModelName(openaiModel: string): string {
    // Map OpenAI model names to Vertex Anthropic model names
    // This would be configurable
    const modelMap: Record<string, string> = {
      'gpt-4': 'claude-3-5-sonnet-v1',
      'gpt-3.5-turbo': 'claude-3-haiku-v1',
      // Add more mappings as needed
    };
    
    return modelMap[openaiModel] || openaiModel;
  }
  
  private getMediaTypeFromUrl(url: string): string {
    if (url.startsWith('data:')) {
      const mimeType = url.split(';')[0].split(':')[1];
      // Anthropic expects specific media type format
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'image/jpeg';
      if (mimeType.includes('png')) return 'image/png';
      if (mimeType.includes('gif')) return 'image/gif';
      if (mimeType.includes('webp')) return 'image/webp';
    }
    
    if (url.includes('.jpg') || url.includes('.jpeg')) return 'image/jpeg';
    if (url.includes('.png')) return 'image/png';
    if (url.includes('.gif')) return 'image/gif';
    if (url.includes('.webp')) return 'image/webp';
    
    return 'image/jpeg'; // Default fallback
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

### Vertex Anthropic to OpenAI Response Mapping

```typescript
class VertexAnthropicResponseConverter {
  // Convert Vertex Anthropic response to OpenAI format
  convertResponse(
    anthropicResponse: AnthropicMessageResponse,
    originalRequest: OpenAIChatCompletionCreateParams
 ): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: anthropicResponse.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: this.extractUsage(anthropicResponse)
    };
    
    // Convert the response to OpenAI format
    const content = this.extractContent(anthropicResponse.content);
    const toolCalls = this.extractToolCalls(anthropicResponse.content);
    
    openaiResponse.choices = [{
      index: 0,
      message: {
        role: 'assistant',
        content: content || null,
        ...(toolCalls.length > 0 && { tool_calls: toolCalls })
      },
      finish_reason: this.mapFinishReason(anthropicResponse.stop_reason)
    }];
    
    return openaiResponse;
  }
  
  private extractContent(contentBlocks: AnthropicContentBlock[]): string | null {
    const textBlocks = contentBlocks
      .filter(block => block.type === 'text')
      .map(block => (block as AnthropicTextContentBlock).text);
    
    return textBlocks.length > 0 ? textBlocks.join(' ') : null;
  }
  
  private extractToolCalls(contentBlocks: AnthropicContentBlock[]): Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }> | undefined {
    const toolUseBlocks = contentBlocks.filter(block => block.type === 'tool_use') as Array<{
      type: 'tool_use';
      id: string;
      name: string;
      input: any;
    }>;
    
    if (toolUseBlocks.length === 0) return undefined;
    
    return toolUseBlocks.map(block => ({
      id: block.id,
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input)
      },
      type: 'function'
    }));
  }
  
  private extractUsage(anthropicResponse: AnthropicMessageResponse): OpenAIUsage {
    const usage = anthropicResponse.usage;
    return {
      prompt_tokens: usage?.input_tokens || 0,
      completion_tokens: usage?.output_tokens || 0,
      total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
    };
  }
  
  private mapFinishReason(finishReason: string | null): string {
    if (!finishReason) return 'stop';
    
    const mapping: Record<string, string> = {
      'end_turn': 'stop',
      'stop_sequence': 'stop',
      'max_tokens': 'length',
      'tool_use': 'tool_calls'
    };
    
    return mapping[finishReason] || 'stop';
  }
}
```

## Streaming Conversion

### Vertex Anthropic Streaming Response Conversion

```typescript
class VertexAnthropicStreamingConverter {
  // Convert Vertex Anthropic streaming response to OpenAI format
  async *convertStreamingResponse(
    anthropicStream: AsyncIterable<AnthropicStreamEvent>,
    originalRequest: OpenAIChatCompletionCreateParams
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    let chunkIndex = 0;
    let accumulatedContent = '';
    let toolCallAccumulator: any = null;
    
    for await (const event of anthropicStream) {
      const openaiChunk = this.convertEventToChunk(
        event, 
        chunkIndex, 
        originalRequest,
        accumulatedContent,
        toolCallAccumulator
      );
      
      if (openaiChunk) {
        yield openaiChunk;
      }
      
      // Update accumulated content based on the event
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        accumulatedContent += event.delta.text || '';
      } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        toolCallAccumulator = {
          id: event.content_block.id,
          name: event.content_block.name,
          input: event.content_block.input || {}
        };
      } else if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
        // Handle incremental updates to tool arguments
        if (toolCallAccumulator && event.delta.partial_json) {
          try {
            // This is a simplified approach - in practice, you'd need to properly
            // accumulate the JSON deltas to form the complete tool arguments
            const partialObj = JSON.parse(event.delta.partial_json);
            toolCallAccumulator.input = { ...toolCallAccumulator.input, ...partialObj };
          } catch (e) {
            // Handle JSON parsing errors
          }
        }
      }
      
      chunkIndex++;
    }
  }
  
  private convertEventToChunk(
    event: AnthropicStreamEvent,
    index: number,
    originalRequest: OpenAIChatCompletionCreateParams,
    accumulatedContent: string,
    toolCallAccumulator: any
  ): OpenAIChatCompletionStreamResponse | null {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: `chatcmpl-${Date.now()}-${index}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: []
    };
    
    let delta: any = {};
    let finish_reason: string | null = null;
    
    switch (event.type) {
      case 'message_start':
        // Initial message info, usually not sent to client in OpenAI format
        return null;
        
      case 'message_delta':
        // Delta information (usage, stop reason)
        finish_reason = event.delta.stop_reason ? 
          this.mapFinishReason(event.delta.stop_reason) : null;
        break;
        
      case 'content_block_start':
        if (event.content_block?.type === 'text') {
          delta = { role: 'assistant', content: event.content_block.text || '' };
        } else if (event.content_block?.type === 'tool_use') {
          delta = {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: event.content_block.id,
              function: {
                name: event.content_block.name,
                arguments: event.content_block.input ? 
                  JSON.stringify(event.content_block.input) : ''
              },
              type: 'function'
            }]
          };
        }
        break;
        
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          delta = { content: event.delta.text };
        } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
          delta = {
            tool_calls: [{
              index: 0,
              function: {
                arguments: event.delta.partial_json
              }
            }]
          };
        }
        break;
        
      case 'content_block_stop':
        // Content block finished, but message may continue
        break;
        
      case 'message_stop':
        finish_reason = 'stop';
        break;
    }
    
    // Add role to delta if not present and it's a content block
    if (!delta.role && (delta.content || delta.tool_calls)) {
      delta.role = 'assistant';
    }
    
    openaiChunk.choices = [{
      index: 0,
      delta,
      finish_reason
    }];
    
    return openaiChunk;
  }
  
  private mapFinishReason(finishReason: string): string | null {
    if (!finishReason) return null;
    
    const mapping: Record<string, string> = {
      'end_turn': 'stop',
      'stop_sequence': 'stop',
      'max_tokens': 'length',
      'tool_use': 'tool_calls'
    };
    
    return mapping[finishReason] || 'stop';
  }
}
```

## Error Conversion

### Vertex Anthropic Error to OpenAI Error Mapping

```typescript
class VertexAnthropicErrorConverter {
 // Convert Vertex Anthropic error to OpenAI-compatible error
  convertError(anthropicError: any): { status: number; error: any } {
    let status = 500;
    let error = {
      message: 'An error occurred with the Vertex Anthropic API',
      type: 'vertex_anthropic_error',
      code: 'vertex_anthropic_error'
    };
    
    // Extract error details from Vertex Anthropic response
    if (anthropicError.error) {
      const anthError = anthropicError.error;
      
      error = {
        message: anthError.message || error.message,
        type: anthError.type || error.type,
        code: anthError.type || error.code
      };
      
      // Map specific Anthropic error types to HTTP status codes
      status = this.mapAnthropicErrorType(anthError.type);
    } else if (anthropicError.message) {
      error.message = anthropicError.message;
    } else if (typeof anthropicError === 'string') {
      error.message = anthropicError;
    }
    
    return { status, error };
  }
  
  private mapAnthropicErrorType(errorType: string): number {
    const typeMap: Record<string, number> = {
      'authentication_error': 401,
      'permission_error': 403,
      'not_found_error': 404,
      'rate_limit_error': 429,
      'api_error': 500,
      'overloaded_error': 503
    };
    
    return typeMap[errorType] || 500;
  }
}
```

## Main Vertex Anthropic Converter Service

### Complete Converter Implementation

```typescript
class VertexAnthropicConverter {
  private requestConverter: VertexAnthropicRequestConverter;
  private responseConverter: VertexAnthropicResponseConverter;
  private streamingConverter: VertexAnthropicStreamingConverter;
  private errorConverter: VertexAnthropicErrorConverter;
  
  constructor() {
    this.requestConverter = new VertexAnthropicRequestConverter();
    this.responseConverter = new VertexAnthropicResponseConverter();
    this.streamingConverter = new VertexAnthropicStreamingConverter();
    this.errorConverter = new VertexAnthropicErrorConverter();
  }
  
  // Convert OpenAI request to Vertex Anthropic format
  convertRequest(openaiRequest: OpenAIChatCompletionCreateParams): VertexAnthropicRequest {
    return this.requestConverter.convertRequest(openaiRequest);
  }
  
  // Convert Vertex Anthropic response to OpenAI format
  convertResponse(
    anthropicResponse: AnthropicMessageResponse,
    originalRequest: OpenAIChatCompletionCreateParams
 ): OpenAIChatCompletionResponse {
    return this.responseConverter.convertResponse(anthropicResponse, originalRequest);
  }
  
  // Convert Vertex Anthropic streaming response to OpenAI format
  async *convertStreamingResponse(
    anthropicStream: AsyncIterable<AnthropicStreamEvent>,
    originalRequest: OpenAIChatCompletionCreateParams
 ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    yield* this.streamingConverter.convertStreamingResponse(anthropicStream, originalRequest);
  }
  
  // Convert Vertex Anthropic error to OpenAI-compatible error
  convertError(anthropicError: any): { status: number; error: any } {
    return this.errorConverter.convertError(anthropicError);
  }
  
  // Make API call to Vertex Anthropic (non-streaming)
  async callNonStreaming(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    try {
      // Convert request
      const anthropicRequest = this.requestConverter.convertRequest(openaiRequest);
      
      // Make API call
      const url = `${config.baseUrl || 'https://us-central1-aiplatform.googleapis.com/v1'}/projects/${config.projectId || 'my-project'}/locations/us-central1/publishers/anthropic/models/${config.model || 'claude-3-5-sonnet'}:generateContent`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'vertex-2023-10-16', // Enable Vertex features
          ...config.additionalHeaders
        },
        body: JSON.stringify({ ...anthropicRequest, stream: false })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.convertError({ ...errorData, status: response.status });
      }
      
      const anthropicResponse = await response.json();
      
      // Convert response
      return this.convertResponse(anthropicResponse, openaiRequest);
    } catch (error) {
      throw this.convertError(error);
    }
 }
  
  // Make API call to Vertex Anthropic (streaming)
  async *callStreaming(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
 ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    try {
      // Convert request with stream=true
      const anthropicRequest = {
        ...this.requestConverter.convertRequest(openaiRequest),
        stream: true
      };
      
      // Make streaming API call
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
        body: JSON.stringify(anthropicRequest)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.convertError({ ...errorData, status: response.status });
      }
      
      if (!response.body) {
        throw new Error('No response body for streaming request');
      }
      
      // Process the streaming response (Server-Sent Events)
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
            
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6);
                if (jsonStr.trim() === '[DONE]') continue;
                
                const event = JSON.parse(jsonStr);
                
                // Convert and yield the event
                if (event.type !== 'message_start') { // Skip initial message info
                  const openaiChunk = this.responseConverter.convertResponse(
                    { ...event, id: event.message?.id || `msg-${Date.now()}` } as any,
                    openaiRequest
                  );
                  
                  // Format as stream response
                  yield this.formatAsStreamResponse(openaiChunk, event);
                }
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
          ...(choice.message.tool_calls && { tool_calls: choice.message.tool_calls })
        },
        finish_reason: choice.finish_reason
      }))
    };
  }
}
```

## Integration with Backend Provider

### Vertex Anthropic Backend Provider

```typescript
class VertexAnthropicBackendProvider implements BackendProvider {
  private converter: VertexAnthropicConverter;
  
  constructor() {
    this.converter = new VertexAnthropicConverter();
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
  
  type: BackendType = 'vertex-anthropic';
}
```

## Configuration and Error Handling

### Configuration Options

The Vertex Anthropic converter supports the following configuration options:

- API key for authentication
- Base URL for the API (defaults to Google's Vertex endpoint)
- Additional headers for custom configuration
- Anthropic-specific headers like version and beta flags
- Model name mapping for different model conventions

### Error Handling

The converter provides comprehensive error handling:

- Maps Vertex Anthropic-specific errors to OpenAI-compatible errors
- Handles HTTP status code mapping
- Provides meaningful error messages
- Maintains error context for debugging

### Special Considerations

1. **System Prompts**: Anthropic has a dedicated `system` field, unlike OpenAI which includes system messages in the messages array.

2. **Tool Usage**: Anthropic handles tools differently with `tool_use` content blocks.

3. **Streaming Events**: Anthropic uses specific event types in its streaming API that need to be mapped to OpenAI's format.

4. **Image Handling**: Anthropic requires images to be provided as base64-encoded data with proper media types.

This Vertex Anthropic API converter provides a complete solution for transforming between OpenAI and Vertex Anthropic API formats while maintaining full compatibility and feature support.