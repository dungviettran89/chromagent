import fetch from 'node-fetch';
import { 
  OpenAIChatCompletionCreateParams, 
  OpenAIChatCompletionResponse, 
  OpenAIChatCompletionStreamResponse, 
  BackendProvider, 
  BackendConfig,
  VertexGeminiRequest,
  VertexContent,
  VertexPart
} from '../types';

export class VertexGeminiBackendProvider implements BackendProvider {
  async chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    try {
      // Convert OpenAI request to Vertex Gemini format
      const geminiRequest = this.transformToVertexGemini(request, config);

      // Make API call to Vertex Gemini
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
        throw new Error(`Vertex Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const geminiResponse = await response.json();
      
      // Convert Vertex Gemini response to OpenAI format
      return this.transformFromVertexGemini(geminiResponse, request);
    } catch (error: any) {
      throw new Error(`Vertex Gemini backend error: ${error.message}`);
    }
  }

  async *chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    try {
      // For streaming, we need to call the streamGenerateContent endpoint
      const geminiRequest = this.transformToVertexGemini(request, config);

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
        throw new Error(`Vertex Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
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
              // Remove "data: " prefix if present
              const jsonStr = line.startsWith('data: ') ? line.substring(6) : line;
              if (jsonStr.trim() === '[DONE]') continue;

              const geminiChunk = JSON.parse(jsonStr);

              // Convert Vertex Gemini chunk to OpenAI format
              const openaiChunk = this.transformFromVertexGeminiChunk(geminiChunk, request);
              
              yield openaiChunk;
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
      throw new Error(`Vertex Gemini streaming error: ${error.message}`);
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
      errors.push('API key is required for Vertex Gemini backend');
    }

    if (config.baseUrl) {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push('Invalid base URL format for Vertex Gemini backend');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private transformToVertexGemini(request: OpenAIChatCompletionCreateParams, config: BackendConfig): VertexGeminiRequest {
    // Map model name if needed
    const model = config.modelMapping?.[request.model] || request.model;
    
    const geminiRequest: VertexGeminiRequest = {
      contents: [],
      generationConfig: {},
      model
    };

    // Convert messages
    geminiRequest.contents = request.messages.map(msg => {
      // Convert role: 'assistant' → 'model' for Gemini
      const role = msg.role === 'assistant' ? 'model' : msg.role;

      // Convert content to parts
      const parts: VertexPart[] = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') {
            parts.push({ text: item.text });
          } else if (item.type === 'image_url' && item.image_url) {
            // Convert image URL to base64 for Gemini
            parts.push({
              inlineData: {
                mimeType: this.getMimeTypeFromUrl(item.image_url.url),
                data: this.urlToBase64Sync(item.image_url.url)
              }
            });
          }
        }
      }

      return {
        role,
        parts
      };
    });

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
      geminiRequest.tools = [{
        functionDeclarations: request.tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description || '',
          parameters: tool.function.parameters
        }))
      }];
    }

    // Convert tool choice if present
    if (request.tool_choice) {
      if (request.tool_choice === 'none') {
        geminiRequest.toolConfig = {
          functionCallingConfig: { mode: 'MODE_UNSPECIFIED' }
        };
      } else if (request.tool_choice === 'auto') {
        geminiRequest.toolConfig = {
          functionCallingConfig: { mode: 'AUTO' }
        };
      } else if (typeof request.tool_choice === 'object' && request.tool_choice.type === 'function') {
        geminiRequest.toolConfig = {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: [request.tool_choice.function.name]
          }
        };
      }
    }

    return geminiRequest;
  }

  private transformFromVertexGemini(response: any, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionResponse {
    const openaiResponse: OpenAIChatCompletionResponse = {
      id: response.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [],
      usage: {
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0
      }
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
          finish_reason: this.mapFinishReason(candidate.finishReason)
        };
      });
    } else {
      // If no candidates, return empty response
      openaiResponse.choices = [{
        index: 0,
        message: {
          role: 'assistant',
          content: null
        },
        finish_reason: 'stop'
      }];
    }

    return openaiResponse;
  }

  private transformFromVertexGeminiChunk(chunk: any, originalRequest: OpenAIChatCompletionCreateParams): OpenAIChatCompletionStreamResponse {
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

  private urlToBase64Sync(url: string): string {
    // This is a placeholder - in a real implementation, we'd need proper async handling
    // For this example, just return the URL as is
    return url;
  }

  private generateToolCallId(): string {
    return `call_${Math.random().toString(36).substring(2, 11)}`;
  }
}