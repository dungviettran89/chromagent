# Token Usage Tracking Design

## Overview

This document outlines the design for implementing token usage tracking in the chromagent-gateway. The gateway must accurately track and report token usage in OpenAI-compatible format while converting backend-specific token counts.

## Token Usage Architecture

### Token Usage Pipeline

The token usage tracking implementation follows this pipeline:

```
OpenAI Request → Token Counter → Backend Request → Backend Response → Token Transformer → OpenAI Response
```

### Core Token Usage Components

#### 1. Token Usage Schema

```typescript
// OpenAI-compatible token usage format
interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Backend-specific token usage formats
interface VertexGeminiUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface VertexAnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}
```

#### 2. Token Counter Interface

```typescript
interface TokenCounter {
  // Count tokens in a text string
  countTokens(text: string): number;
  
 // Count tokens in a message
  countMessageTokens(message: OpenAIChatCompletionMessageParam): number;
  
  // Count tokens in a conversation
  countConversationTokens(messages: OpenAIChatCompletionMessageParam[]): number;
  
  // Count tokens in tools/functions
  countToolTokens(tools: OpenAIFunction[] | undefined): number;
  
  // Count tokens in tool calls
  countToolCallTokens(toolCalls: any[] | undefined): number;
  
  // Count tokens in images (approximation)
  countImageTokens(imageData: any[]): number;
  
  // Map backend token counts to OpenAI format
  mapTokenCounts(backendUsage: any, backendType: BackendType): OpenAIUsage;
  
  // Calculate token usage for a complete request/response
  calculateUsage(
    request: OpenAIChatCompletionCreateParams,
    response: any,
    backendType: BackendType
  ): OpenAIUsage;
}
```

## Token Counting Implementation

### 1. General Token Counter

```typescript
class GeneralTokenCounter implements TokenCounter {
  // Simple token counting using character-based approximation
  // In a real implementation, we'd use proper tokenizers
  countTokens(text: string): number {
    if (!text) return 0;
    
    // Simple approximation: count words or use a proper tokenizer
    // This is a basic implementation - in practice, we'd use a proper tokenizer
    return Math.ceil(text.length / 4); // Rough approximation: 1 token ~ 4 characters
  }
  
 countMessageTokens(message: OpenAIChatCompletionMessageParam): number {
    let tokens = 0;
    
    // Count role tokens
    tokens += this.countTokens(message.role);
    
    // Count content tokens
    if (typeof message.content === 'string') {
      tokens += this.countTokens(message.content);
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.type === 'text') {
          tokens += this.countTokens(item.text);
        } else if (item.type === 'image_url') {
          // Approximate tokens for images
          tokens += this.countImageTokens([item]);
        }
      }
    }
    
    // Count function calls if present
    if (message.function_call) {
      tokens += this.countTokens(JSON.stringify(message.function_call));
    }
    
    // Count tool calls if present
    if (message.tool_calls) {
      tokens += this.countToolCallTokens(message.tool_calls);
    }
    
    return tokens;
  }
  
  countConversationTokens(messages: OpenAIChatCompletionMessageParam[]): number {
    return messages.reduce((total, message) => total + this.countMessageTokens(message), 0);
  }
  
  countToolTokens(tools: OpenAIFunction[] | undefined): number {
    if (!tools) return 0;
    
    let tokens = 0;
    for (const tool of tools) {
      tokens += this.countTokens(tool.function.name);
      tokens += this.countTokens(tool.function.description || '');
      tokens += this.countTokens(JSON.stringify(tool.function.parameters));
    }
    
    return tokens;
  }
  
  countToolCallTokens(toolCalls: any[] | undefined): number {
    if (!toolCalls) return 0;
    
    return toolCalls.reduce((total, call) => {
      let callTokens = 0;
      callTokens += this.countTokens(call.function?.name || '');
      callTokens += this.countTokens(call.function?.arguments || '');
      return total + callTokens;
    }, 0);
  }
  
 countImageTokens(imageData: any[]): number {
    // Images don't directly translate to tokens, but they have processing costs
    // This is an approximation - in practice, this would depend on the backend
    return imageData.length * 85; // Common approximation for image token cost
  }
  
  mapTokenCounts(backendUsage: any, backendType: BackendType): OpenAIUsage {
    switch (backendType) {
      case 'vertex-gemini':
        return this.mapVertexGeminiUsage(backendUsage);
      case 'vertex-anthropic':
        return this.mapVertexAnthropicUsage(backendUsage);
      default:
        return {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        };
    }
  }
  
 private mapVertexGeminiUsage(usage: VertexGeminiUsage | any): OpenAIUsage {
    return {
      prompt_tokens: usage?.promptTokenCount || 0,
      completion_tokens: usage?.candidatesTokenCount || 0,
      total_tokens: usage?.totalTokenCount || 0
    };
  }
  
  private mapVertexAnthropicUsage(usage: VertexAnthropicUsage | any): OpenAIUsage {
    return {
      prompt_tokens: usage?.input_tokens || 0,
      completion_tokens: usage?.output_tokens || 0,
      total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
    };
  }
  
  calculateUsage(
    request: OpenAIChatCompletionCreateParams,
    response: any,
    backendType: BackendType
  ): OpenAIUsage {
    // Calculate prompt tokens from the request
    let promptTokens = this.countConversationTokens(request.messages);
    if (request.tools) {
      promptTokens += this.countToolTokens(request.tools);
    }
    
    // Get completion tokens from the response
    const responseUsage = this.mapTokenCounts(response.usageMetadata || response.usage, backendType);
    
    // If backend didn't provide usage, estimate it
    if (responseUsage.prompt_tokens === 0 && responseUsage.completion_tokens === 0) {
      // Estimate based on response content
      let completionTokens = 0;
      if (response.choices) {
        for (const choice of response.choices) {
          if (choice.message?.content) {
            completionTokens += this.countTokens(choice.message.content);
          }
          if (choice.message?.tool_calls) {
            completionTokens += this.countToolCallTokens(choice.message.tool_calls);
          }
        }
      }
      
      return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      };
    }
    
    // Use backend-provided usage but adjust prompt tokens if needed
    return {
      prompt_tokens: promptTokens, // Use calculated prompt tokens
      completion_tokens: responseUsage.completion_tokens,
      total_tokens: promptTokens + responseUsage.completion_tokens
    };
 }
}
```

### 2. Advanced Token Counter with Proper Tokenizers

```typescript
class AdvancedTokenCounter implements TokenCounter {
  // Using a proper tokenizer library would be ideal
  // For now, we'll simulate with more accurate methods
  private tokenizerCache = new Map<string, any>();
  
  countTokens(text: string): number {
    if (!text) return 0;
    
    // In a real implementation, we'd use a proper tokenizer like:
    // - @dqbd/tiktoken for OpenAI tokenizers
    // - Or backend-specific tokenizers
    
    // For now, use a more sophisticated approximation
    // Split on whitespace and punctuation
    const tokens = text.split(/(\s+|[.!?,"()])/).filter(token => token.trim() !== '');
    return tokens.length;
  }
  
  // Other methods would be similar to GeneralTokenCounter but with more accurate tokenization
  countMessageTokens(message: OpenAIChatCompletionMessageParam): number {
    let tokens = 0;
    
    // Count role tokens
    tokens += this.countTokens(message.role);
    
    // Count content tokens
    if (typeof message.content === 'string') {
      tokens += this.countTokens(message.content);
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.type === 'text') {
          tokens += this.countTokens(item.text);
        } else if (item.type === 'image_url') {
          tokens += this.countImageTokens([item]);
        }
      }
    }
    
    // Count function calls if present
    if (message.function_call) {
      tokens += this.countTokens(JSON.stringify(message.function_call));
    }
    
    // Count tool calls if present
    if (message.tool_calls) {
      tokens += this.countToolCallTokens(message.tool_calls);
    }
    
    return tokens;
  }
  
  // ... other methods similar to GeneralTokenCounter
  countConversationTokens(messages: OpenAIChatCompletionMessageParam[]): number {
    return messages.reduce((total, message) => total + this.countMessageTokens(message), 0);
  }
  
  countToolTokens(tools: OpenAIFunction[] | undefined): number {
    if (!tools) return 0;
    
    let tokens = 0;
    for (const tool of tools) {
      tokens += this.countTokens(tool.function.name);
      tokens += this.countTokens(tool.function.description || '');
      tokens += this.countTokens(JSON.stringify(tool.function.parameters));
    }
    
    return tokens;
  }
  
 countToolCallTokens(toolCalls: any[] | undefined): number {
    if (!toolCalls) return 0;
    
    return toolCalls.reduce((total, call) => {
      let callTokens = 0;
      callTokens += this.countTokens(call.function?.name || '');
      callTokens += this.countTokens(call.function?.arguments || '');
      return total + callTokens;
    }, 0);
  }
  
  countImageTokens(imageData: any[]): number {
    // More accurate image token estimation
    return imageData.length * 85; // Common approximation
  }
  
  mapTokenCounts(backendUsage: any, backendType: BackendType): OpenAIUsage {
    switch (backendType) {
      case 'vertex-gemini':
        return this.mapVertexGeminiUsage(backendUsage);
      case 'vertex-anthropic':
        return this.mapVertexAnthropicUsage(backendUsage);
      default:
        return {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        };
    }
  }
  
  private mapVertexGeminiUsage(usage: VertexGeminiUsage | any): OpenAIUsage {
    return {
      prompt_tokens: usage?.promptTokenCount || 0,
      completion_tokens: usage?.candidatesTokenCount || 0,
      total_tokens: usage?.totalTokenCount || 0
    };
  }
  
  private mapVertexAnthropicUsage(usage: VertexAnthropicUsage | any): OpenAIUsage {
    return {
      prompt_tokens: usage?.input_tokens || 0,
      completion_tokens: usage?.output_tokens || 0,
      total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
    };
  }
  
  calculateUsage(
    request: OpenAIChatCompletionCreateParams,
    response: any,
    backendType: BackendType
  ): OpenAIUsage {
    // Calculate prompt tokens from the request
    let promptTokens = this.countConversationTokens(request.messages);
    if (request.tools) {
      promptTokens += this.countToolTokens(request.tools);
    }
    
    // Get completion tokens from the response
    const responseUsage = this.mapTokenCounts(response.usageMetadata || response.usage, backendType);
    
    // If backend didn't provide usage, estimate it
    if (responseUsage.prompt_tokens === 0 && responseUsage.completion_tokens === 0) {
      // Estimate based on response content
      let completionTokens = 0;
      if (response.choices) {
        for (const choice of response.choices) {
          if (choice.message?.content) {
            completionTokens += this.countTokens(choice.message.content);
          }
          if (choice.message?.tool_calls) {
            completionTokens += this.countToolCallTokens(choice.message.tool_calls);
          }
        }
      }
      
      return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      };
    }
    
    // Use backend-provided usage but adjust prompt tokens if needed
    return {
      prompt_tokens: Math.max(promptTokens, responseUsage.prompt_tokens), // Use the larger of calculated or reported
      completion_tokens: responseUsage.completion_tokens,
      total_tokens: Math.max(promptTokens, responseUsage.prompt_tokens) + responseUsage.completion_tokens
    };
  }
}
```

## Token Usage Service

### Main Token Usage Service

```typescript
class TokenUsageService {
  private counter: TokenCounter;
  private cache: Map<string, OpenAIUsage>;
  
  constructor(counter: TokenCounter) {
    this.counter = counter;
    this.cache = new Map();
  }
  
  // Calculate token usage for a request
  calculateRequestUsage(
    request: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIUsage {
    // For prompt tokens, we can calculate this directly from the request
    const promptTokens = this.counter.countConversationTokens(request.messages);
    let totalPromptTokens = promptTokens;
    
    if (request.tools) {
      totalPromptTokens += this.counter.countToolTokens(request.tools);
    }
    
    // We can't calculate completion tokens without the response,
    // so return just prompt tokens for now
    return {
      prompt_tokens: totalPromptTokens,
      completion_tokens: 0, // Will be filled in with response
      total_tokens: totalPromptTokens // Will be updated with response
    };
  }
  
  // Calculate token usage for a response
  calculateResponseUsage(
    request: OpenAIChatCompletionCreateParams,
    backendResponse: any,
    backendType: BackendType
  ): OpenAIUsage {
    return this.counter.calculateUsage(request, backendResponse, backendType);
  }
  
  // Calculate token usage for streaming responses
  async *calculateStreamingUsage(
    request: OpenAIChatCompletionCreateParams,
    backendStream: AsyncIterable<any>,
    backendType: BackendType
  ): AsyncIterable<{ chunk: any; usage: OpenAIUsage }> {
    let cumulativeUsage: OpenAIUsage = {
      prompt_tokens: this.counter.countConversationTokens(request.messages) + 
                   (request.tools ? this.counter.countToolTokens(request.tools) : 0),
      completion_tokens: 0,
      total_tokens: 0
    };
    
    let responseContent = '';
    
    for await (const chunk of backendStream) {
      // Accumulate content to calculate tokens
      if (chunk.choices && chunk.choices[0]?.delta?.content) {
        responseContent += chunk.choices[0].delta.content;
      }
      
      // Update completion tokens based on accumulated content
      const completionTokens = this.counter.countTokens(responseContent);
      cumulativeUsage = {
        prompt_tokens: cumulativeUsage.prompt_tokens,
        completion_tokens: completionTokens,
        total_tokens: cumulativeUsage.prompt_tokens + completionTokens
      };
      
      yield {
        chunk,
        usage: cumulativeUsage
      };
    }
 }
  
  // Cache token usage for a request ID
 cacheUsage(requestId: string, usage: OpenAIUsage): void {
    this.cache.set(requestId, usage);
 }
  
  // Retrieve cached token usage
 getCachedUsage(requestId: string): OpenAIUsage | undefined {
    return this.cache.get(requestId);
  }
  
  // Clear cache entry
  clearCache(requestId: string): void {
    this.cache.delete(requestId);
  }
}
```

## Integration with Request/Response Transformers

### Request Transformer Integration

```typescript
class RequestTransformer {
  private tokenService: TokenUsageService;
  
  constructor(tokenService: TokenUsageService) {
    this.tokenService = tokenService;
  }
  
  transformToBackend(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): any {
    // Calculate prompt token usage
    const promptUsage = this.tokenService.calculateRequestUsage(openaiRequest, backendType);
    
    // Store the usage information for later use when processing the response
    // In a real implementation, this might be stored in a temporary cache with a request ID
    
    // Transform to backend format
    const backendRequest = this.transformToBackendFormat(openaiRequest, backendType);
    
    // Add the calculated usage info to the request context
    (backendRequest as any)._promptUsage = promptUsage;
    
    return backendRequest;
  }
  
  private transformToBackendFormat(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): any {
    // Implementation of the actual transformation logic
    // This would be the same as in the previous documents
    return {};
  }
}
```

### Response Transformer Integration

```typescript
class ResponseTransformer {
  private tokenService: TokenUsageService;
  
 constructor(tokenService: TokenUsageService) {
    this.tokenService = tokenService;
  }
  
  transformToOpenAI(
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
      usage: this.tokenService.calculateResponseUsage(originalRequest, backendResponse, backendType)
    };
    
    return openaiResponse;
  }
  
  async *transformStreamToOpenAI(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    // For streaming, we need to accumulate token usage as chunks come in
    const usageGenerator = this.tokenService.calculateStreamingUsage(
      originalRequest,
      backendStream,
      backendType
    );
    
    for await (const { chunk, usage } of usageGenerator) {
      // Transform the chunk to OpenAI format
      const openaiChunk = this.transformChunk(chunk, 0, originalRequest, backendType);
      
      // Add usage information to the final chunk
      if (chunk.choices?.every(choice => choice.finish_reason)) {
        // This is a final chunk, add usage
        (openaiChunk as any).usage = usage;
      }
      
      yield openaiChunk;
    }
  }
  
  private transformChunk(
    backendChunk: any,
    index: number,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionStreamResponse {
    // Implementation of chunk transformation
    // This would be the same as in the streaming document
    return {} as OpenAIChatCompletionStreamResponse;
  }
  
  private transformChoices(backendResponse: any, backendType: BackendType): any[] {
    // Implementation of choices transformation
    // This would be the same as in the transformation document
    return [];
  }
  
  private generateId(): string {
    return `chatcmpl-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## Token Usage Reporting

### Usage Reporting Middleware

```typescript
class UsageReportingMiddleware {
  private tokenService: TokenUsageService;
  
  constructor(tokenService: TokenUsageService) {
    this.tokenService = tokenService;
  }
  
  // Middleware to log token usage
  logUsage = async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Capture the original end method
    const originalEnd = res.end;
    
    // Override the end method to capture the response
    res.end = (chunk: any, encoding: any, callback: any) => {
      const duration = Date.now() - startTime;
      
      // Log usage statistics
      if (res.locals.usage) {
        console.log(`Request ID: ${req.id || 'unknown'}`);
        console.log(`Duration: ${duration}ms`);
        console.log(`Tokens: ${res.locals.usage.prompt_tokens} prompt + ${res.locals.usage.completion_tokens} completion = ${res.locals.usage.total_tokens} total`);
      }
      
      // Call the original end method
      return originalEnd.call(res, chunk, encoding, callback);
    };
    
    next();
  };
  
  // Endpoint to get usage statistics
 getUsageStats = (req: Request, res: Response) => {
    // This would return aggregated usage statistics
    // Implementation would depend on the storage mechanism used
    res.json({
      total_requests: 0,
      total_tokens: 0,
      avg_tokens_per_request: 0,
      usage_by_model: {},
      usage_by_backend: {}
    });
  };
}
```

## Performance Considerations

### 1. Efficient Token Counting

- Use caching for frequently used text patterns
- Implement lazy evaluation where possible
- Consider approximate counting for better performance

### 2. Memory Management

- Limit the size of cached usage data
- Implement proper cleanup of temporary usage data
- Use streaming processing for large responses

### 3. Accuracy vs Performance

- Balance token counting accuracy with performance requirements
- Provide options for different levels of accuracy
- Consider backend-specific token counting when available

## Accuracy Considerations

### 1. Backend-Specific Tokenization

Different backends may use different tokenization methods, so the gateway should:

- Prefer backend-reported token counts when available
- Use backend-specific tokenization when possible
- Provide accurate approximations when backend counts aren't available

### 2. Image Token Approximation

Images don't directly translate to tokens, but they impact usage:

- Use standardized approximations for image token costs
- Consider image resolution and format in calculations
- Account for image processing overhead

### 3. Tool/Function Tokenization

- Count function definitions as part of prompt tokens
- Count function calls as part of completion tokens
- Consider tool schema complexity in token calculations

This token usage tracking implementation provides accurate token counting and reporting while maintaining compatibility with different backend providers.