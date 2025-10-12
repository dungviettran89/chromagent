import { 
  OpenAIChatCompletionCreateParams, 
  OpenAIChatCompletionResponse, 
  OpenAIChatCompletionStreamResponse,
  VertexGeminiRequest,
  VertexAnthropicRequest,
  AnthropicMessageParam,
  AnthropicContentBlock
} from '../types';

export class RequestTransformer {
  // Main method to transform OpenAI request to backend format
  transformToBackend(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: string
  ): any {
    switch (backendType) {
      case 'vertex-gemini':
        return this.transformToVertexGemini(openaiRequest);
      case 'vertex-anthropic':
        return this.transformToVertexAnthropic(openaiRequest);
      case 'ollama':
        return this.transformToOllama(openaiRequest);
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
  // Transform to Vertex Gemini format
  private transformToVertexGemini(request: OpenAIChatCompletionCreateParams): VertexGeminiRequest {
    const geminiRequest: VertexGeminiRequest = {
      contents: [],
      generationConfig: {},
      model: this.mapModelName(request.model, 'vertex-gemini')
    };
    
    // Convert messages
    geminiRequest.contents = this.transformMessagesToVertexGemini(request.messages);
    
    // Convert generation config
    if (request.temperature !== undefined) {
      if (!geminiRequest.generationConfig) geminiRequest.generationConfig = {};
      geminiRequest.generationConfig.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      if (!geminiRequest.generationConfig) geminiRequest.generationConfig = {};
      geminiRequest.generationConfig.topP = request.top_p;
    }
    if (request.max_tokens !== undefined) {
      if (!geminiRequest.generationConfig) geminiRequest.generationConfig = {};
      geminiRequest.generationConfig.maxOutputTokens = request.max_tokens;
    }
    
    // Convert tools if present
    if (request.tools) {
      geminiRequest.tools = this.transformToolsToVertexGemini(request.tools);
    }
    
    // Convert tool choice if present
    if (request.tool_choice) {
      geminiRequest.toolConfig = this.transformToolChoiceToVertexGemini(request.tool_choice);
    }
    
    return geminiRequest;
  }
  
  // Transform to Vertex Anthropic format
  private transformToVertexAnthropic(request: OpenAIChatCompletionCreateParams): VertexAnthropicRequest {
    const anthropicRequest: VertexAnthropicRequest = {
      model: this.mapModelName(request.model, 'vertex-anthropic'),
      max_tokens: request.max_tokens || 1024, // Default max tokens
      messages: [],
      stream: request.stream || false
    };
    
    // Convert temperature and top_p if provided
    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      anthropicRequest.top_p = request.top_p;
    }
    
    // Convert tools if present
    if (request.tools) {
      anthropicRequest.tools = this.transformToolsToVertexAnthropic(request.tools);
    }
    
    // Convert tool choice if present
    if (request.tool_choice) {
      anthropicRequest.tool_choice = this.transformToolChoiceToVertexAnthropic(request.tool_choice);
    }
    
    // Convert messages, separating system messages
    const { messages, systemPrompt } = this.transformMessagesToVertexAnthropic(request.messages);
    anthropicRequest.messages = messages;
    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }
    
    return anthropicRequest;
  }
  
  // Transform to Ollama format
  private transformToOllama(request: OpenAIChatCompletionCreateParams): any {
    // Transform to Ollama format
    const ollamaRequest: any = {
      model: this.mapModelName(request.model, 'ollama'),
      messages: this.transformMessagesToOllama(request.messages),
      stream: request.stream || false,
      options: {}
    };
    
    // Convert generation options
    if (request.temperature !== undefined) {
      ollamaRequest.options.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      ollamaRequest.options.top_p = request.top_p;
    }
    if (request.max_tokens !== undefined) {
      ollamaRequest.options.max_tokens = request.max_tokens;
    }
    
    return ollamaRequest;
  }
  
  private transformMessagesToVertexGemini(messages: any[]): any[] {
    return messages.map(msg => {
      // Convert role: 'assistant' → 'model' for Gemini
      const role = msg.role === 'assistant' ? 'model' : msg.role;
      
      // Convert content to parts
      const parts = this.convertContentToGeminiParts(msg.content);
      
      return {
        role,
        parts
      };
    });
  }
  
  private convertContentToGeminiParts(content: any): any[] {
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
              data: this.urlToBase64Sync(item.image_url.url)
            }
          };
        }
        return { text: '' }; // Fallback
      });
    }
    
    return [{ text: '' }]; // Fallback
  }
  
  private transformMessagesToVertexAnthropic(messages: any[]): {
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
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
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
                  data: this.urlToBase64Sync(item.image_url.url)
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
  
  private transformMessagesToOllama(messages: any[]): any[] {
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
            const base64Image = this.urlToBase64Sync(item.image_url.url);
            images.push(base64Image);
          }
        }
      }
      
      const result: any = {
        role: msg.role,
        content,
      };
      
      if (images.length > 0) {
        result.images = images;
      }
      
      return result;
    });
  }
  
  private transformToolsToVertexGemini(tools: any[]): any {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: tool.function.parameters
      }))
    }];
  }
  
  private transformToolsToVertexAnthropic(tools: any[]): any {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }));
  }
  
  private transformToolChoiceToVertexGemini(toolChoice: any): any {
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
  
  private transformToolChoiceToVertexAnthropic(toolChoice: any): any {
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
  
  private mapModelName(model: string, backendType: string): string {
    // Model mapping based on configuration
    // This would use the modelMapping from backend config in a full implementation
    return model;
  }
  
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
  
  private urlToBase64Sync(url: string): string {
    // This is a placeholder - in a real implementation, we'd use an async version
    // For this example, we'll return just the URL as is
    return url;
  }
}

export class ResponseTransformer {
  // Main method to transform backend response to OpenAI format
  transformToOpenAI(
    backendResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: string
  ): OpenAIChatCompletionResponse {
    switch (backendType) {
      case 'vertex-gemini':
        return this.transformFromVertexGemini(backendResponse, originalRequest);
      case 'vertex-anthropic':
        return this.transformFromVertexAnthropic(backendResponse, originalRequest);
      case 'ollama':
        return this.transformFromOllama(backendResponse, originalRequest);
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
  // Transform streaming responses
  async *transformStreamToOpenAI(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: string
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    for await (const chunk of backendStream) {
      const openaiChunk = this.transformChunkToOpenAI(chunk, originalRequest, backendType);
      yield openaiChunk;
    }
  }
  
  private transformFromVertexGemini(
    response: any, 
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: response.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: this.extractVertexGeminiUsage(response)
    };
    
    // Convert candidates to choices
    if (response.candidates) {
      openaiResponse.choices = response.candidates.map((candidate: any, index: number) => {
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
          finish_reason: this.mapVertexFinishReason(candidate.finishReason)
        };
      });
    }
    
    return openaiResponse;
  }
  
  private transformFromVertexAnthropic(
    response: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: this.extractVertexAnthropicUsage(response)
    };
    
    // Convert the response to OpenAI format
    const content = this.extractAnthropicContent(response.content);
    const toolCalls = this.extractAnthropicToolCalls(response.content);
    
    openaiResponse.choices = [{
      index: 0,
      message: {
        role: 'assistant',
        content: content || null,
        ...(toolCalls && toolCalls.length > 0 && { tool_calls: toolCalls })
      },
      finish_reason: this.mapAnthropicFinishReason(response.stop_reason)
    }];
    
    return openaiResponse;
  }
  
  private transformFromOllama(
    response: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: response.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: this.extractOllamaUsage(response)
    };
    
    // Convert Ollama response to OpenAI format
    openaiResponse.choices = [{
      index: 0,
      message: {
        role: 'assistant',
        content: response.message?.content || response.response || null
      },
      finish_reason: 'stop'
    }];
    
    return openaiResponse;
  }
  
  private transformChunkToOpenAI(
    chunk: any,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: string
  ): OpenAIChatCompletionStreamResponse {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: []
    };
    
    switch (backendType) {
      case 'vertex-gemini':
        return this.transformVertexGeminiChunk(chunk, originalRequest);
      case 'vertex-anthropic':
        return this.transformVertexAnthropicChunk(chunk, originalRequest);
      case 'ollama':
        return this.transformOllamaChunk(chunk, originalRequest);
      default:
        throw new Error(`Unsupported backend type: ${backendType}`);
    }
  }
  
  private transformVertexGeminiChunk(
    chunk: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionStreamResponse {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: chunk.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: []
    };
    
    // Convert candidates to choices
    if (chunk.candidates) {
      openaiChunk.choices = chunk.candidates.map((candidate: any, candidateIndex: number) => {
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
          finish_reason: candidate.finishReason ? this.mapVertexFinishReason(candidate.finishReason) : null
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
  
  private transformVertexAnthropicChunk(
    chunk: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionStreamResponse {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: chunk.message?.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: null
      }]
    };
    
    let delta: any = {};
    let finish_reason: string | null = null;
    
    // Handle different Anthropic event types
    if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'text') {
      delta = { role: 'assistant', content: chunk.content_block.text || '' };
    } else if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      delta = { content: chunk.delta.text };
    } else if (chunk.type === 'message_delta') {
      finish_reason = chunk.delta.stop_reason ? 
        this.mapAnthropicFinishReason(chunk.delta.stop_reason) : null;
    }
    
    // Add role to delta if not present and it's a content block
    if (!delta.role && (delta.content || delta.tool_calls)) {
      delta.role = 'assistant';
    }
    
    openaiChunk.choices[0].delta = delta;
    openaiChunk.choices[0].finish_reason = finish_reason as 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;
    
    return openaiChunk;
  }
  
  private transformOllamaChunk(
    chunk: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionStreamResponse {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        delta: {
          content: chunk.message?.content || chunk.response || ''
        },
        finish_reason: chunk.done ? 'stop' : null
      }]
    };
    
    return openaiChunk;
  }
  
  private extractVertexGeminiUsage(response: any): any {
    const usageMetadata = response.usageMetadata;
    return {
      prompt_tokens: usageMetadata?.promptTokenCount || 0,
      completion_tokens: usageMetadata?.candidatesTokenCount || 0,
      total_tokens: usageMetadata?.totalTokenCount || 0
    };
  }
  
  private extractVertexAnthropicUsage(response: any): any {
    const usage = response.usage;
    return {
      prompt_tokens: usage?.input_tokens || 0,
      completion_tokens: usage?.output_tokens || 0,
      total_tokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
    };
  }
  
  private extractOllamaUsage(response: any): any {
    return {
      prompt_tokens: response.prompt_eval_count || 0,
      completion_tokens: response.eval_count || 0,
      total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0)
    };
  }
  
  private extractAnthropicContent(contentBlocks: any[]): string | null {
    const textBlocks = contentBlocks
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text);
    
    return textBlocks.length > 0 ? textBlocks.join(' ') : null;
  }
  
  private extractAnthropicToolCalls(contentBlocks: any[]): Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }> | undefined {
    const toolUseBlocks = contentBlocks.filter((block: any) => block.type === 'tool_use');
    
    if (toolUseBlocks.length === 0) return undefined;
    
    return toolUseBlocks.map((block: any) => ({
      id: block.id,
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input)
      },
      type: 'function'
    }));
  }
  
  private mapVertexFinishReason(finishReason: string | undefined): 'stop' | 'length' | 'content_filter' | 'function_call' | 'tool_calls' {
    if (!finishReason) return 'stop';
    
    const mapping: Record<string, 'stop' | 'length' | 'content_filter' | 'function_call' | 'tool_calls'> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'OTHER': 'stop'
    };
    
    return mapping[finishReason] || 'stop';
  }
  
  private mapAnthropicFinishReason(finishReason: string | null): 'stop' | 'length' | 'content_filter' | 'function_call' | 'tool_calls' {
    if (!finishReason) return 'stop';
    
    const mapping: Record<string, 'stop' | 'length' | 'content_filter' | 'function_call' | 'tool_calls'> = {
      'end_turn': 'stop',
      'stop_sequence': 'stop',
      'max_tokens': 'length',
      'tool_use': 'tool_calls'
    };
    
    return mapping[finishReason as keyof typeof mapping] || 'stop';
  }
  
  private generateToolCallId(): string {
    return `call_${Math.random().toString(36).substring(2, 11)}`;
  }
}