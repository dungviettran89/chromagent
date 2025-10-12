import { OpenAIFunction } from '../types';

export interface ToolHandler {
  // Transform OpenAI tools to backend format
  transformToolsToBackend(
    tools: OpenAIFunction[] | undefined,
    backendType: string
  ): any;
  
  // Transform tool choice to backend format
  transformToolChoiceToBackend(
    toolChoice: any,
    backendType: string
  ): any;
  
  // Transform backend tool calls to OpenAI format
  transformToolCallsFromBackend(
    backendResponse: any,
    backendType: string
  ): Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }> | undefined;
  
  // Transform streaming tool calls to OpenAI format
  transformStreamingToolCalls(
    backendChunk: any,
    backendType: string
  ): any; // For streaming responses
}

export class ToolTransformationService implements ToolHandler {
  // Transform tools from OpenAI to backend format
  transformToolsToBackend(
    tools: OpenAIFunction[] | undefined,
    backendType: string
  ): any {
    if (!tools || tools.length === 0) {
      return undefined;
    }
    
    switch (backendType) {
      case 'vertex-gemini':
        return [{
          functionDeclarations: tools.map(tool => ({
            name: tool.function.name,
            description: tool.function.description || '',
            parameters: tool.function.parameters
          }))
        }];
        
      case 'vertex-anthropic':
        return tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          input_schema: tool.function.parameters
        }));
        
      case 'ollama':
        return tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          }
        }));
        
      default:
        throw new Error(`No tool handler for backend type: ${backendType}`);
    }
  }
  
  // Transform tool choice from OpenAI to backend format
  transformToolChoiceToBackend(
    toolChoice: any,
    backendType: string
  ): any {
    if (!toolChoice) {
      return undefined;
    }
    
    switch (backendType) {
      case 'vertex-gemini':
        if (toolChoice === 'none') {
          return {
            functionCallingConfig: { 
              mode: 'MODE_UNSPECIFIED' // Effectively disables function calling
            }
          };
        } else if (toolChoice === 'auto') {
          return {
            functionCallingConfig: { 
              mode: 'AUTO' 
            }
          };
        } else if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
          return {
            functionCallingConfig: { 
              mode: 'ANY', // or 'AUTO' depending on preference
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
        } else if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
          return {
            type: 'tool',
            name: toolChoice.function.name
          };
        }
        return undefined;
        
      case 'ollama':
        // Ollama doesn't have a specific tool_choice format equivalent
        // It typically relies on the presence of tools in the request
        return undefined;
        
      default:
        throw new Error(`No tool choice handler for backend type: ${backendType}`);
    }
  }
  
  // Transform tool calls from backend to OpenAI format
  transformToolCallsFromBackend(
    backendResponse: any,
    backendType: string
  ): Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }> | undefined {
    switch (backendType) {
      case 'vertex-gemini':
        if (!backendResponse.candidates) return undefined;
        
        const allGeminiToolCalls: Array<{
          id: string;
          function: {
            name: string;
            arguments: string;
          };
          type: 'function';
        }> = [];
        
        for (const candidate of backendResponse.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                allGeminiToolCalls.push({
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
        }
        
        return allGeminiToolCalls.length > 0 ? allGeminiToolCalls : undefined;
        
      case 'vertex-anthropic':
        if (!backendResponse.content) return undefined;
        
        const allAnthropicToolCalls: Array<{
          id: string;
          function: {
            name: string;
            arguments: string;
          };
          type: 'function';
        }> = [];
        
        for (const contentBlock of backendResponse.content) {
          if (contentBlock.type === 'tool_use') {
            allAnthropicToolCalls.push({
              id: contentBlock.id,
              function: {
                name: contentBlock.name,
                arguments: JSON.stringify(contentBlock.input)
              },
              type: 'function'
            });
          }
        }
        
        return allAnthropicToolCalls.length > 0 ? allAnthropicToolCalls : undefined;
        
      case 'ollama':
        // Ollama tool call processing would be specific to its response format
        // This is a simplified example
        if (backendResponse.message?.tool_calls) {
          return backendResponse.message.tool_calls.map((call: any) => ({
            id: call.id || this.generateToolCallId(),
            function: {
              name: call.function?.name || call.name,
              arguments: call.function?.arguments || JSON.stringify(call.arguments || {})
            },
            type: 'function'
          }));
        }
        return undefined;
        
      default:
        throw new Error(`No tool call handler for backend type: ${backendType}`);
    }
  }
  
  // Transform streaming tool calls
  transformStreamingToolCalls(
    backendChunk: any,
    backendType: string
  ): any {
    switch (backendType) {
      case 'vertex-gemini':
        // For streaming, extract function calls from the chunk
        if (!backendChunk.candidates) return undefined;
        
        const geminiToolCalls: any[] = [];
        
        for (const candidate of backendChunk.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                geminiToolCalls.push({
                  index: candidate.index || 0,
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
        }
        
        return geminiToolCalls.length > 0 ? geminiToolCalls : undefined;
        
      case 'vertex-anthropic':
        // For Anthropic streaming, handle different event types
        switch (backendChunk.type) {
          case 'content_block_start':
            if (backendChunk.content_block?.type === 'tool_use') {
              return {
                index: backendChunk.index || 0,
                id: backendChunk.content_block.id,
                function: {
                  name: backendChunk.content_block.name,
                  arguments: JSON.stringify(backendChunk.content_block.input || {})
                },
                type: 'function'
              };
            }
            break;
            
          case 'content_block_delta':
            if (backendChunk.delta?.type === 'input_json_delta') {
              // Handle incremental updates to tool arguments
              return {
                index: backendChunk.index || 0,
                // Note: Anthropic streaming for tool inputs is more complex
                // and may require accumulating deltas
              };
            }
            break;
        }
        return undefined;
        
      case 'ollama':
        // Ollama streaming tool calls processing
        if (backendChunk.message?.tool_calls) {
          return backendChunk.message.tool_calls.map((call: any) => ({
            index: 0, // Ollama typically doesn't have index in the same way
            id: call.id || this.generateToolCallId(),
            function: {
              name: call.function?.name || call.name,
              arguments: call.function?.arguments || JSON.stringify(call.arguments || {})
            },
            type: 'function'
          }));
        }
        return undefined;
        
      default:
        throw new Error(`No streaming tool call handler for backend type: ${backendType}`);
    }
  }
  
  private generateToolCallId(): string {
    return `call_${Math.random().toString(36).substring(2, 11)}`;
  }
}

export class ToolValidator {
  // Validate OpenAI tool schema
  validateOpenAITool(tool: OpenAIFunction): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!tool.type || tool.type !== 'function') {
      errors.push('Tool type must be "function"');
    }
    
    if (!tool.function) {
      errors.push('Tool must have a function property');
    } else {
      if (!tool.function.name) {
        errors.push('Tool function must have a name');
      }
      
      if (!tool.function.parameters) {
        errors.push('Tool function must have parameters');
      } else {
        if (!tool.function.parameters.type || tool.function.parameters.type !== 'object') {
          errors.push('Tool function parameters must have type "object"');
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Validate that required parameters are provided
  validateToolArguments(
    toolName: string,
    args: any,
    toolDefinitions: OpenAIFunction[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const toolDef = toolDefinitions.find(t => t.function.name === toolName);
    if (!toolDef) {
      errors.push(`Tool ${toolName} not found in definitions`);
      return { valid: false, errors };
    }
    
    const params = toolDef.function.parameters;
    const required = params.required || [];
    
    for (const req of required) {
      if (!(req in args)) {
        errors.push(`Required parameter "${req}" missing for tool "${toolName}"`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}