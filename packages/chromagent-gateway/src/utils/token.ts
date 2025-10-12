import { OpenAIChatCompletionCreateParams, OpenAIUsage, OpenAIChatCompletionMessageParam } from '../types';

export interface TokenCounter {
  // Count tokens in a text string
  countTokens(text: string): number;
  
  // Count tokens in a message
  countMessageTokens(message: OpenAIChatCompletionMessageParam): number;
  
  // Count tokens in a conversation
  countConversationTokens(messages: OpenAIChatCompletionMessageParam[]): number;
  
  // Count tokens in tools/functions
  countToolTokens(tools: any[] | undefined): number;
  
  // Count tokens in tool calls
  countToolCallTokens(toolCalls: any[] | undefined): number;
  
  // Count tokens in images (approximation)
  countImageTokens(imageData: any[]): number;
  
  // Map backend token counts to OpenAI format
  mapTokenCounts(backendUsage: any, backendType: string): OpenAIUsage;
  
  // Calculate token usage for a complete request/response
  calculateUsage(
    request: OpenAIChatCompletionCreateParams,
    response: any,
    backendType: string
  ): OpenAIUsage;
}

export class TokenUsageService {
  private counter: TokenCounter;
  
  constructor(counter?: TokenCounter) {
    this.counter = counter || new GeneralTokenCounter();
  }
  
  // Calculate token usage for a request
  calculateRequestUsage(
    request: OpenAIChatCompletionCreateParams,
    backendType: string
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
    backendType: string
  ): OpenAIUsage {
    return this.counter.calculateUsage(request, backendResponse, backendType);
  }
  
  // Calculate token usage for streaming responses
  async *calculateStreamingUsage(
    request: OpenAIChatCompletionCreateParams,
    backendStream: AsyncIterable<any>,
    backendType: string
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
}

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
          tokens += this.countTokens(item.text || '');
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
  
  countToolTokens(tools: any[] | undefined): number {
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
  
  mapTokenCounts(backendUsage: any, backendType: string): OpenAIUsage {
    switch (backendType) {
      case 'vertex-gemini':
        return this.mapVertexGeminiUsage(backendUsage);
      case 'vertex-anthropic':
        return this.mapVertexAnthropicUsage(backendUsage);
      case 'ollama':
        return this.mapOllamaUsage(backendUsage);
      default:
        return {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        };
    }
  }
  
  private mapVertexGeminiUsage(usage: any): OpenAIUsage {
    return {
      prompt_tokens: usage?.promptTokenCount || 0,
      completion_tokens: usage?.candidatesTokenCount || 0,
      total_tokens: usage?.totalTokenCount || 0
    };
  }
  
  private mapVertexAnthropicUsage(usage: any): OpenAIUsage {
    return {
      prompt_tokens: usage?.input_tokens || 0,
      completion_tokens: usage?.output_tokens || 0,
      total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
    };
  }
  
  private mapOllamaUsage(usage: any): OpenAIUsage {
    return {
      prompt_tokens: usage?.prompt_eval_count || 0,
      completion_tokens: usage?.eval_count || 0,
      total_tokens: (usage?.prompt_eval_count || 0) + (usage?.eval_count || 0)
    };
  }
  
  calculateUsage(
    request: OpenAIChatCompletionCreateParams,
    response: any,
    backendType: string
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