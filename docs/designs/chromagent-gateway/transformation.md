# Request/Response Transformation Logic Design

## Overview

This document outlines the design for the request/response transformation logic in the chromagent-gateway. The transformation layer is responsible for converting between OpenAI-compatible formats and backend-specific formats for various LLM providers.

## Transformation Architecture

### Transformation Pipeline

The transformation process follows this pipeline:

```
OpenAI Request → Request Transformer → Backend Request
Backend Response → Response Transformer → OpenAI Response
```

### Core Transformation Components

#### 1. RequestTransformer Class

```typescript
class RequestTransformer {
  // Main method to transform OpenAI request to backend format
  transformToBackend(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): any {
    switch (backendType) {
      case 'vertex-gemini':
        return this.transformToVertexGemini(openaiRequest);
      case 'vertex-anthropic':
        return this.transformToVertexAnthropic(openaiRequest);
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
 // Transform to Vertex Gemini format
  transformToVertexGemini(request: OpenAIChatCompletionCreateParams): VertexGeminiRequest;
  
  // Transform to Vertex Anthropic format
 transformToVertexAnthropic(request: OpenAIChatCompletionCreateParams): VertexAnthropicRequest;
  
 // Helper methods for specific transformations
  transformMessages(messages: OpenAIChatCompletionMessageParam[], backendType: BackendType): any;
  transformTools(tools: OpenAIFunction[] | undefined, backendType: BackendType): any;
  transformImages(imageData: any, backendType: BackendType): any;
}
```

#### 2. ResponseTransformer Class

```typescript
class ResponseTransformer {
  // Main method to transform backend response to OpenAI format
  transformToOpenAI(
    backendResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionResponse {
    switch (backendType) {
      case 'vertex-gemini':
        return this.transformFromVertexGemini(backendResponse, originalRequest);
      case 'vertex-anthropic':
        return this.transformFromVertexAnthropic(backendResponse, originalRequest);
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
 // Transform streaming responses
  transformStreamToOpenAI(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse>;
  
  // Transform from Vertex Gemini format
  transformFromVertexGemini(response: VertexGeminiResponse, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionResponse;
  
  // Transform from Vertex Anthropic format
  transformFromVertexAnthropic(response: VertexAnthropicResponse, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionResponse;
}
```

## Message Transformation

### OpenAI to Backend Message Mapping

#### System Messages
- OpenAI: `{ role: 'system', content: '...' }`
- Vertex Gemini: Included in `systemInstruction` field
- Vertex Anthropic: Included in `system` field

#### User Messages
- OpenAI: `{ role: 'user', content: '...' }` or `{ role: 'user', content: [{ type: 'text', text: '...' }, { type: 'image_url', image_url: { url: '...' }] }`
- Vertex Gemini: `{ role: 'user', parts: [...] }`
- Vertex Anthropic: `{ role: 'user', content: [...] }`

#### Assistant Messages
- OpenAI: `{ role: 'assistant', content: '...' }`
- Vertex Gemini: `{ role: 'model', parts: [...] }`
- Vertex Anthropic: `{ role: 'assistant', content: [...] }`

### Message Transformation Implementation

```typescript
class MessageTransformer {
  // Transform OpenAI messages to backend-specific format
  transformToBackend(
    messages: OpenAIChatCompletionMessageParam[],
    backendType: BackendType
  ): any[] {
    switch (backendType) {
      case 'vertex-gemini':
        return this.toVertexGeminiFormat(messages);
      case 'vertex-anthropic':
        return this.toVertexAnthropicFormat(messages);
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
  // Transform Vertex Gemini messages back to OpenAI format
  transformFromVertexGemini(
    vertexMessages: VertexContent[],
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionMessageParam[] {
    // Implementation
  }
  
  // Transform Vertex Anthropic messages back to OpenAI format
  transformFromVertexAnthropic(
    anthropicMessages: AnthropicMessageParam[],
    originalRequest: OpenAIChatCompletionCreateParams
 ): OpenAIChatCompletionMessageParam[] {
    // Implementation
  }
  
  private toVertexGeminiFormat(messages: OpenAIChatCompletionMessageParam[]): VertexContent[] {
    return messages.map(msg => {
      // Convert role: 'assistant' → 'model' for Gemini
      const role = msg.role === 'assistant' ? 'model' : msg.role;
      
      // Convert content to parts
      const parts = this.convertContentToParts(msg.content);
      
      return {
        role,
        parts
      };
    });
  }
  
  private toVertexAnthropicFormat(messages: OpenAIChatCompletionMessageParam[]): AnthropicMessageParam[] {
    return messages.map(msg => {
      // For Anthropic, assistant role remains as 'assistant'
      // Convert content appropriately
      return {
        role: msg.role as 'user' | 'assistant',
        content: this.convertContentToAnthropicFormat(msg.content)
      };
    });
  }
  
  private convertContentToParts(content: string | null | Array<any>): VertexPart[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }
    
    if (Array.isArray(content)) {
      return content.map(item => {
        if (item.type === 'text') {
          return { text: item.text };
        } else if (item.type === 'image_url') {
          // Convert image URL to base64 for Gemini
          return {
            inlineData: {
              mimeType: this.getMimeTypeFromUrl(item.image_url.url),
              data: this.urlToBase64(item.image_url.url)
            }
          };
        }
        return { text: '' }; // Fallback
      });
    }
    
    return [{ text: '' }]; // Fallback
  }
}
```

## Tool/Function Transformation

### OpenAI Functions to Backend Tools

#### OpenAI Format
```typescript
{
  type: 'function',
  function: {
    name: string,
    description?: string,
    parameters: {
      type: 'object',
      properties: Record<string, any>,
      required?: string[]
    }
 }
}
```

#### Vertex Gemini Format
```typescript
{
  functionDeclarations: [{
    name: string,
    description: string,
    parameters: {
      type: string,
      properties: Record<string, any>,
      required?: string[]
    }
  }]
}
```

#### Vertex Anthropic Format
```typescript
{
  name: string,
  description?: string,
  input_schema: {
    type: 'object',
    properties: Record<string, any>,
    required?: string[]
  }
}
```

### Tool Transformation Implementation

```typescript
class ToolTransformer {
  // Transform OpenAI tools to backend format
  transformToBackend(
    tools: OpenAIFunction[] | undefined,
    backendType: BackendType
 ): any {
    if (!tools || tools.length === 0) {
      return undefined;
    }
    
    switch (backendType) {
      case 'vertex-gemini':
        return {
          functionDeclarations: tools.map(tool => this.toVertexGeminiFormat(tool))
        };
      case 'vertex-anthropic':
        return tools.map(tool => this.toVertexAnthropicFormat(tool));
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
 // Transform tool choice parameter
  transformToolChoice(
    toolChoice: 'none' | 'auto' | { type: 'function'; function: { name: string } } | undefined,
    backendType: BackendType
 ): any {
    switch (backendType) {
      case 'vertex-gemini':
        if (toolChoice === 'none') {
          return {
            functionCallingConfig: { mode: 'MODE_UNSPECIFIED' }
          };
        } else if (toolChoice === 'auto') {
          return {
            functionCallingConfig: { mode: 'AUTO' }
          };
        } else if (toolChoice && 'function' in toolChoice) {
          return {
            functionCallingConfig: { 
              mode: 'ANY',
              allowedFunctionNames: [toolChoice.function.name]
            }
          };
        }
        return undefined;
      case 'vertex-anthropic':
        if (toolChoice === 'none') {
          return { type: 'none' };
        } else if (toolChoice === 'auto') {
          return { type: 'auto' };
        } else if (toolChoice && 'function' in toolChoice) {
          return { 
            type: 'tool', 
            name: toolChoice.function.name 
          };
        }
        return undefined;
      default:
        return undefined;
    }
 }
  
  private toVertexGeminiFormat(tool: OpenAIFunction): VertexFunctionDeclaration {
    return {
      name: tool.function.name,
      description: tool.function.description || '',
      parameters: tool.function.parameters
    };
 }
  
  private toVertexAnthropicFormat(tool: OpenAIFunction): AnthropicTool {
    return {
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    };
  }
}
```

## Image Transformation

### Image Handling Strategy

The gateway needs to handle image inputs in OpenAI format and convert them to backend-specific formats:

#### OpenAI Image Format
```typescript
{
  type: 'image_url',
  image_url: {
    url: string,
    detail?: 'auto' | 'low' | 'high'
  }
}
```

#### Vertex Gemini Image Format
```typescript
{
  inlineData: {
    mimeType: string,
    data: string // base64 encoded
  }
}
```

#### Vertex Anthropic Image Format
```typescript
{
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
    data: string // base64 encoded
  }
}
```

### Image Transformation Implementation

```typescript
class ImageTransformer {
  // Convert image URLs to backend-specific formats
  async convertToBackendFormat(
    imageData: Array<{ url: string; detail?: string }>,
    backendType: BackendType
  ): Promise<any[]> {
    const imageParts = [];
    
    for (const img of imageData) {
      // Fetch image and convert to base64
      const base64Data = await this.urlToBase64(img.url);
      const mimeType = this.getMimeTypeFromUrl(img.url);
      
      switch (backendType) {
        case 'vertex-gemini':
          imageParts.push({
            inlineData: {
              mimeType,
              data: base64Data
            }
          });
          break;
        case 'vertex-anthropic':
          imageParts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as any,
              data: base64Data
            }
          });
          break;
      }
    }
    
    return imageParts;
  }
  
  // Extract image data from OpenAI message format
 extractImageData(message: OpenAIChatCompletionMessageParam): Array<{
    type: 'image_url';
    image_url: {
      url: string;
      detail?: 'auto' | 'low' | 'high';
    };
  }> {
    if (typeof message.content === 'string') {
      return [];
    }
    
    if (Array.isArray(message.content)) {
      return message.content
        .filter(item => item.type === 'image_url')
        .map(item => item as any);
    }
    
    return [];
  }
  
  // Convert URL to base64
  private async urlToBase64(url: string): Promise<string> {
    // If it's already a data URL, return as is
    if (url.startsWith('data:')) {
      return url.split(',')[1]; // Extract base64 part
    }
    
    // Fetch the image using fetch API
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    return base64;
  }
  
  // Extract MIME type from URL or data URL
 private getMimeTypeFromUrl(url: string): string {
    if (url.startsWith('data:')) {
      return url.split(';')[0].split(':')[1];
    }
    
    if (url.includes('.jpg') || url.includes('.jpeg')) return 'image/jpeg';
    if (url.includes('.png')) return 'image/png';
    if (url.includes('.gif')) return 'image/gif';
    if (url.includes('.webp')) return 'image/webp';
    
    return 'image/jpeg'; // Default fallback
  }
}
```

## Streaming Transformation

### Streaming Response Transformation

For streaming responses, the transformation needs to handle incremental updates:

```typescript
class StreamingTransformer {
  async *transformStreamToOpenAI(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    let index = 0;
    
    for await (const chunk of backendStream) {
      const openaiChunk = this.transformChunkToOpenAI(chunk, index, originalRequest, backendType);
      yield openaiChunk;
      index++;
    }
 }
  
  transformChunkToOpenAI(
    chunk: any,
    index: number,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionStreamResponse {
    switch (backendType) {
      case 'vertex-gemini':
        return this.transformVertexGeminiChunk(chunk, index);
      case 'vertex-anthropic':
        return this.transformVertexAnthropicChunk(chunk, index);
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
  private transformVertexGeminiChunk(
    chunk: any,
    index: number
  ): OpenAIChatCompletionStreamResponse {
    // Convert Vertex Gemini streaming chunk to OpenAI format
    const choices = chunk.candidates?.map((candidate: any, i: number) => ({
      index: i,
      delta: {
        content: candidate.content?.parts?.[0]?.text || '',
        role: 'assistant'
      },
      finish_reason: this.mapVertexFinishReason(candidate.finishReason)
    })) || [{
      index,
      delta: {
        content: chunk.text || '',
        role: 'assistant'
      },
      finish_reason: null
    }];
    
    return {
      id: chunk.id || `chunk-${index}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: chunk.model || 'unknown',
      choices
    };
  }
  
  private transformVertexAnthropicChunk(
    chunk: any,
    index: number
  ): OpenAIChatCompletionStreamResponse {
    // Convert Vertex Anthropic streaming chunk to OpenAI format
    let delta: any = {};
    let finish_reason: string | null = null;
    
    switch (chunk.type) {
      case 'content_block_start':
        delta = { role: 'assistant', content: chunk.content_block.text || '' };
        break;
      case 'content_block_delta':
        delta = { content: chunk.delta.text };
        break;
      case 'message_delta':
        finish_reason = this.mapAnthropicFinishReason(chunk.delta.stop_reason);
        break;
      case 'message_stop':
        finish_reason = 'stop';
        break;
    }
    
    return {
      id: chunk.message?.id || `chunk-${index}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: chunk.model || 'unknown',
      choices: [{
        index,
        delta,
        finish_reason
      }]
    };
  }
  
  private mapVertexFinishReason(vertexReason: string | undefined): string | null {
    if (!vertexReason) return null;
    
    const mapping: Record<string, string> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    
    return mapping[vertexReason] || 'stop';
  }
  
  private mapAnthropicFinishReason(anthropicReason: string | undefined): string | null {
    if (!anthropicReason) return null;
    
    const mapping: Record<string, string> = {
      'stop_sequence': 'stop',
      'max_tokens': 'length',
      'end_turn': 'stop',
      'tool_use': 'tool_calls'
    };
    
    return mapping[anthropicReason] || 'stop';
  }
}
```

## Token Usage Transformation

### Token Count Mapping

Different backends report token usage differently:

```typescript
class TokenTransformer {
  // Map backend token usage to OpenAI format
 mapTokenCounts(
    backendUsage: any,
    backendType: BackendType
  ): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } {
    switch (backendType) {
      case 'vertex-gemini':
        return {
          prompt_tokens: backendUsage?.promptTokenCount || 0,
          completion_tokens: backendUsage?.candidatesTokenCount || 0,
          total_tokens: backendUsage?.totalTokenCount || 0
        };
      case 'vertex-anthropic':
        return {
          prompt_tokens: backendUsage?.input_tokens || 0,
          completion_tokens: backendUsage?.output_tokens || 0,
          total_tokens: (backendUsage?.input_tokens || 0) + (backendUsage?.output_tokens || 0)
        };
      default:
        return {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        };
    }
  }
}
```

## Error Transformation

### Error Format Mapping

```typescript
class ErrorTransformer {
  transformBackendError(
    backendError: any,
    backendType: BackendType
  ): { status: number; error: any } {
    let status = 500;
    let error = {
      message: 'An error occurred',
      type: 'internal_error',
      code: 'gateway_error'
    };
    
    switch (backendType) {
      case 'vertex-gemini':
        if (backendError.status) {
          status = this.mapVertexStatus(backendError.status);
        }
        error = {
          message: backendError.message || 'Vertex Gemini API error',
          type: 'vertex_error',
          code: backendError.code
        };
        break;
        
      case 'vertex-anthropic':
        if (backendError.type) {
          status = this.mapAnthropicStatus(backendError.type);
        }
        error = {
          message: backendError.message || 'Vertex Anthropic API error',
          type: 'anthropic_error',
          code: backendError.error?.type
        };
        break;
    }
    
    return { status, error };
  }
  
  private mapVertexStatus(vertexStatus: string): number {
    const statusMap: Record<string, number> = {
      'INVALID_ARGUMENT': 40,
      'UNAUTHENTICATED': 401,
      'PERMISSION_DENIED': 403,
      'NOT_FOUND': 404,
      'RESOURCE_EXHAUSTED': 429,
      'INTERNAL': 500,
      'UNAVAILABLE': 503
    };
    
    return statusMap[vertexStatus] || 500;
  }
  
  private mapAnthropicStatus(anthropicType: string): number {
    // Anthropic-specific status mapping
    return 500; // Simplified for this example
  }
}
```

## Transformation Pipeline Integration

### Main Transformer Orchestrator

```typescript
class Transformer {
  private messageTransformer: MessageTransformer;
  private toolTransformer: ToolTransformer;
  private imageTransformer: ImageTransformer;
  private streamingTransformer: StreamingTransformer;
  private tokenTransformer: TokenTransformer;
  private errorTransformer: ErrorTransformer;
  
  constructor() {
    this.messageTransformer = new MessageTransformer();
    this.toolTransformer = new ToolTransformer();
    this.imageTransformer = new ImageTransformer();
    this.streamingTransformer = new StreamingTransformer();
    this.tokenTransformer = new TokenTransformer();
    this.errorTransformer = new ErrorTransformer();
  }
  
 // Complete request transformation
  transformRequestToBackend(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): any {
    const backendRequest: any = {
      // Map common fields
      model: this.mapModel(openaiRequest.model, backendType),
      generationConfig: {
        temperature: openaiRequest.temperature,
        topP: openaiRequest.top_p,
        maxOutputTokens: openaiRequest.max_tokens
      }
    };
    
    // Transform messages
    backendRequest.contents = this.messageTransformer.transformToBackend(
      openaiRequest.messages,
      backendType
    );
    
    // Transform tools if present
    if (openaiRequest.tools) {
      backendRequest.tools = this.toolTransformer.transformToBackend(
        openaiRequest.tools,
        backendType
      );
    }
    
    // Transform tool choice if present
    if (openaiRequest.tool_choice) {
      backendRequest.toolConfig = this.toolTransformer.transformToolChoice(
        openaiRequest.tool_choice,
        backendType
      );
    }
    
    return backendRequest;
  }
  
  // Complete response transformation
  transformResponseToOpenAI(
    backendResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionResponse {
    // Transform the main response
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: backendResponse.id || this.generateId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: this.transformChoices(backendResponse, backendType),
      usage: this.tokenTransformer.mapTokenCounts(backendResponse.usageMetadata || backendResponse.usage, backendType)
    };
    
    return openaiResponse;
  }
  
  private transformChoices(backendResponse: any, backendType: BackendType): any[] {
    switch (backendType) {
      case 'vertex-gemini':
        return this.transformVertexGeminiChoices(backendResponse);
      case 'vertex-anthropic':
        return this.transformVertexAnthropicChoices(backendResponse);
      default:
        return [];
    }
 }
  
  private generateId(): string {
    return `chatcmpl-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private mapModel(openaiModel: string, backendType: BackendType): string {
    // Model mapping based on configuration
    // This would use the modelMapping from backend config
    return openaiModel; // Simplified for this example
  }
  
  private transformVertexGeminiChoices(response: any): any[] {
    if (!response.candidates) return [];
    
    return response.candidates.map((candidate: any, index: number) => {
      const content = candidate.content?.parts
        ?.map((part: any) => part.text)
        .join('') || '';
      
      return {
        index,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: this.mapVertexFinishReason(candidate.finishReason)
      };
    });
  }
  
  private transformVertexAnthropicChoices(response: any): any[] {
    if (!response.content) return [];
    
    const content = response.content
      .map((block: any) => {
        if (block.type === 'text') return block.text;
        return '';
      })
      .join('');
    
    return [{
      index: 0,
      message: {
        role: 'assistant',
        content
      },
      finish_reason: this.mapAnthropicFinishReason(response.stop_reason)
    }];
  }
  
  private mapVertexFinishReason(vertexReason: string | undefined): string {
    if (!vertexReason) return 'stop';
    
    const mapping: Record<string, string> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    
    return mapping[vertexReason] || 'stop';
  }
  
  private mapAnthropicFinishReason(anthropicReason: string | undefined): string {
    if (!anthropicReason) return 'stop';
    
    const mapping: Record<string, string> = {
      'stop_sequence': 'stop',
      'max_tokens': 'length',
      'end_turn': 'stop',
      'tool_use': 'tool_calls'
    };
    
    return mapping[anthropicReason] || 'stop';
  }
}
```

## Performance Considerations

### 1. Memory Efficiency
- Stream processing for large responses
- Efficient data structures to minimize memory footprint
- Proper cleanup of temporary data

### 2. Processing Speed
- Optimized transformation algorithms
- Caching of frequently used transformations
- Asynchronous processing where appropriate

### 3. Error Handling
- Graceful degradation when transformations fail
- Detailed error logging for debugging
- Fallback mechanisms for unsupported features

This transformation logic provides the foundation for converting between OpenAI-compatible formats and backend-specific formats while maintaining the necessary functionality for each provider.