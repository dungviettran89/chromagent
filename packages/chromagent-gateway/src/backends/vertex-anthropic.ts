import fetch from 'node-fetch';
import { 
  OpenAIChatCompletionCreateParams, 
  OpenAIChatCompletionResponse, 
  OpenAIChatCompletionStreamResponse, 
  BackendProvider, 
  BackendConfig,
  VertexAnthropicRequest
} from '../types';

export class VertexAnthropicBackendProvider implements BackendProvider {
  async chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    try {
      // Convert OpenAI request to Vertex Anthropic format
      const anthropicRequest = this.transformToVertexAnthropic(request, config);

      // Make API call to Vertex Anthropic
      // Use the correct Vertex AI endpoint for Anthropic models
      const url = `${config.baseUrl || 'https://us-central1-aiplatform.googleapis.com/v1'}/projects/${config.projectId || process.env.GCLOUD_PROJECT_ID || 'my-project'}/locations/us-central1/publishers/anthropic/models/${config.model || 'claude-3-5-sonnet'}:generateContent`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          //FIX-THIS: Read document and fix this header
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'vertex-2023-10-16', // Enable Vertex features
          ...config.additionalHeaders
        },
        body: JSON.stringify({ ...anthropicRequest, stream: false })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Vertex Anthropic API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const anthropicResponse = await response.json();
      
      // Convert Vertex Anthropic response to OpenAI format
      return this.transformFromVertexAnthropic(anthropicResponse, request);
    } catch (error: any) {
      throw new Error(`Vertex Anthropic backend error: ${error.message}`);
    }
  }

  async *chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    try {
      // For streaming, we need to call with stream=true
      const anthropicRequest = {
        ...this.transformToVertexAnthropic(request, config),
        stream: true
      };

      const url = `${config.baseUrl || 'https://us-central1-aiplatform.googleapis.com/v1'}/projects/${config.projectId || process.env.GCLOUD_PROJECT_ID || 'my-project'}/locations/us-central1/publishers/anthropic/models/${config.model || 'claude-3-5-sonnet'}:generateContent`;

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
        throw new Error(`Vertex Anthropic API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming request');
      }

      // Process the streaming response (Server-Sent Events)
      const reader = (response.body as unknown as ReadableStream).getReader();
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

                // Skip initial message info
                if (event.type !== 'message_start') {
                  // Convert and yield the event
                  const openaiChunk = this.transformFromVertexAnthropicChunk(event, request);
                  yield openaiChunk;
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
    } catch (error: any) {
      throw new Error(`Vertex Anthropic streaming error: ${error.message}`);
    }
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

  validateConfig(config: BackendConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('API key is required for Vertex Anthropic backend');
    }

    // If using Vertex AI (not a custom base URL), projectId is required
    if (!config.baseUrl) {
      if (!config.projectId && !process.env.GCLOUD_PROJECT_ID) {
        errors.push('Project ID is required for Vertex Anthropic backend (either as config.projectId or GCLOUD_PROJECT_ID environment variable)');
      }
    } else {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push('Invalid base URL format for Vertex Anthropic backend');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private transformToVertexAnthropic(request: OpenAIChatCompletionCreateParams, config: BackendConfig): VertexAnthropicRequest {
    // Map model name if needed
    const model = config.modelMapping?.[request.model] || request.model;
    
    const anthropicRequest: VertexAnthropicRequest = {
      model,
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
      anthropicRequest.tools = request.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters
      }));
    }

    // Convert tool choice if present
    if (request.tool_choice) {
      if (request.tool_choice === 'none') {
        anthropicRequest.tool_choice = { type: 'none' };
      } else if (request.tool_choice === 'auto') {
        anthropicRequest.tool_choice = { type: 'auto' };
      } else if (typeof request.tool_choice === 'object' && request.tool_choice.type === 'function') {
        anthropicRequest.tool_choice = { 
          type: 'tool', 
          name: request.tool_choice.function.name 
        };
      }
    }

    // Convert messages, separating system messages
    const { messages, systemPrompt } = this.transformMessages(request.messages);
    anthropicRequest.messages = messages;
    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }

    return anthropicRequest;
  }

  private transformMessages(messages: any[]): {
    messages: any[];
    systemPrompt: string | undefined;
  } {
    const anthropicMessages: any[] = [];
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
        const anthropicMessage: any = {
          role: message.role,
          content: []
        };

        if (typeof message.content === 'string') {
          anthropicMessage.content = message.content;
        } else if (Array.isArray(message.content)) {
          const contentBlocks: any[] = [];
          
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

  private transformFromVertexAnthropic(response: any, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: {
        prompt_tokens: response.usage?.input_tokens || 0,
        completion_tokens: response.usage?.output_tokens || 0,
        total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      }
    };

    // Convert the response to OpenAI format
    const content = this.extractContent(response.content);
    const toolCalls = this.extractToolCalls(response.content);

    openaiResponse.choices = [{
      index: 0,
      message: {
        role: 'assistant',
        content: content || null,
        ...(toolCalls && toolCalls.length > 0 && { tool_calls: toolCalls })
      },
      finish_reason: this.mapFinishReason(response.stop_reason) || 'stop'
    }];

    return openaiResponse;
  }

  private transformFromVertexAnthropicChunk(event: any, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionStreamResponse {
    const openaiChunk: OpenAIChatCompletionStreamResponse = {
      id: event.message?.id || `chatcmpl-${Date.now()}`,
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

    switch (event.type) {
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
        
      case 'message_stop':
        finish_reason = 'stop';
        break;
    }

    // Add role to delta if not present and it's a content block
    if (!delta.role && (delta.content || delta.tool_calls)) {
      delta.role = 'assistant';
    }

    openaiChunk.choices[0].delta = delta;
    openaiChunk.choices[0].finish_reason = finish_reason as 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | null;

    return openaiChunk;
  }

  private extractContent(contentBlocks: any[]): string | null {
    const textBlocks = contentBlocks
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text);
    
    return textBlocks.length > 0 ? textBlocks.join(' ') : null;
  }
  
  private extractToolCalls(contentBlocks: any[]): Array<{
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

  private mapFinishReason(finishReason: string | null): 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' {
    if (!finishReason) return 'stop';
    
    const mapping: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call'> = {
      'end_turn': 'stop',
      'stop_sequence': 'stop',
      'max_tokens': 'length',
      'tool_use': 'tool_calls'
    };
    
    if (finishReason && finishReason in mapping) {
      return mapping[finishReason as keyof typeof mapping];
    }
    return 'stop';
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
    // This is a placeholder - in a real implementation, we'd need proper async handling
    // For this example, just return the URL as is
    return url;
  }
}