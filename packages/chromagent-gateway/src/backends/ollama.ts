import fetch from 'node-fetch';
import { 
  OpenAIChatCompletionCreateParams, 
  OpenAIChatCompletionResponse, 
  OpenAIChatCompletionStreamResponse, 
  BackendProvider, 
  BackendConfig
} from '../types';

export class OllamaBackendProvider implements BackendProvider {
  async chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    try {
      // Convert OpenAI request to Ollama format
      const ollamaRequest = this.transformToOllama(request, config);

      // Make API call to Ollama
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
        throw new Error(`Ollama API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const ollamaResponse = await response.json();
      
      // Convert Ollama response to OpenAI format
      return this.transformFromOllama(ollamaResponse, request);
    } catch (error: any) {
      throw new Error(`Ollama backend error: ${error.message}`);
    }
  }

  async *chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    try {
      // For streaming, we need to call with stream=true
      const ollamaRequest = {
        ...this.transformToOllama(request, config),
        stream: true
      };

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
        throw new Error(`Ollama API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming request');
      }

      // Process the streaming response
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

            try {
              const parsed = JSON.parse(line);

              // Convert Ollama response to OpenAI stream format
              const openaiChunk = this.transformFromOllamaChunk(parsed, request);
              
              yield openaiChunk;

              if (parsed.done) break;
            } catch (e) {
              // Skip malformed lines
              continue;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error: any) {
      throw new Error(`Ollama streaming error: ${error.message}`);
    }
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

  validateConfig(config: BackendConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.baseUrl) {
      errors.push('Base URL is required for Ollama backend');
    } else {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push('Invalid base URL format for Ollama backend');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private transformToOllama(request: OpenAIChatCompletionCreateParams, config: BackendConfig): any {
    // Map model name if needed
    const model = config.modelMapping?.[request.model] || request.model;
    
    // Map OpenAI messages to Ollama format
    const messages = request.messages.map(msg => {
      let content = '';
      const images: string[] = [];
      
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') {
            content += item.text;
          } else if (item.type === 'image_url' && item.image_url) {
            // Convert image URL to base64 for Ollama
            const base64Image = this.urlToBase64Sync(item.image_url.url);
            images.push(base64Image);
          }
        }
      }
      
      const ollamaMsg: any = {
        role: msg.role,
        content,
      };
      
      // Add images if present
      if (images.length > 0) {
        ollamaMsg.images = images;
      }
      
      return ollamaMsg;
    });
    
    const ollamaRequest: any = {
      model,
      messages,
      options: {},
      stream: request.stream || false
    };

    // Convert generation options
    if (request.temperature !== undefined) {
      ollamaRequest.options.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      ollamaRequest.options.top_p = request.top_p;
    }
    if (request.max_tokens !== undefined) {
      ollamaRequest.options.num_predict = request.max_tokens;
    }

    // Convert tools if present
    if (request.tools) {
      ollamaRequest.tools = request.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters
        }
      }));
    }

    return ollamaRequest;
  }

  private transformFromOllama(response: any, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionResponse {
    return {
      id: response.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.message?.content || response.response || null
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: response.prompt_eval_count || 0,
        completion_tokens: response.eval_count || 0,
        total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0)
      }
    };
  }

  private transformFromOllamaChunk(chunk: any, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionStreamResponse {
    return {
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
  }

  private urlToBase64Sync(url: string): string {
    // This is a placeholder - in a real implementation, we'd need proper async handling
    // For this example, just return the URL as is
    return url;
  }
}