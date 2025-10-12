# Tool Calls Support Design

## Overview

This document outlines the design for implementing tool calls (function calling) in the chromagent-gateway. The gateway must support OpenAI-compatible function calling while properly transforming tool call requests and responses for various backend providers.

## Tool Calls Architecture

### Tool Calls Pipeline

The tool calls implementation follows this pipeline:

```
OpenAI Request (with tools) → Request Transformer → Backend Request (with tools)
Backend Response (with tool calls) → Response Transformer → OpenAI Response (with tool calls)
```

### Core Tool Calls Components

#### 1. Tool Schema

```typescript
// OpenAI-compatible tool definition
interface OpenAIFunction {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// OpenAI tool choice parameter
type OpenAIToolChoice = 
  | 'none' 
  | 'auto' 
  | { type: 'function'; function: { name: string } };
```

#### 2. Tool Handler Interface

```typescript
interface ToolHandler {
  // Transform OpenAI tools to backend format
  transformToolsToBackend(
    tools: OpenAIFunction[] | undefined,
    backendType: BackendType
  ): any;
  
  // Transform tool choice to backend format
  transformToolChoiceToBackend(
    toolChoice: OpenAIToolChoice | undefined,
    backendType: BackendType
  ): any;
  
  // Transform backend tool calls to OpenAI format
  transformToolCallsFromBackend(
    backendResponse: any,
    backendType: BackendType
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
    backendType: BackendType
  ): any; // For streaming responses
}
```

## Backend-Specific Tool Implementations

### 1. Vertex Gemini Tool Support

#### Gemini Tool Format

Vertex Gemini uses function declarations for tool definitions:

```json
{
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": "get_current_weather",
          "description": "Get the current weather in a given location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA"
              },
              "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"]
              }
            },
            "required": ["location"]
          }
        }
      ]
    }
  ],
  "toolConfig": {
    "functionCallingConfig": {
      "mode": "AUTO"
    }
  }
}
```

#### Gemini Tool Handler Implementation

```typescript
class VertexGeminiToolHandler implements ToolHandler {
  transformToolsToBackend(
    tools: OpenAIFunction[] | undefined,
    backendType: BackendType
  ): any {
    if (!tools || tools.length === 0) {
      return undefined;
    }
    
    return {
      functionDeclarations: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: tool.function.parameters
      }))
    };
  }
  
  transformToolChoiceToBackend(
    toolChoice: OpenAIToolChoice | undefined,
    backendType: BackendType
  ): any {
    if (!toolChoice) {
      return undefined;
    }
    
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
  }
  
  transformToolCallsFromBackend(
    backendResponse: any,
    backendType: BackendType
  ): Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }> | undefined {
    if (!backendResponse.candidates) return undefined;
    
    const allToolCalls: Array<{
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
            allToolCalls.push({
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
    
    return allToolCalls.length > 0 ? allToolCalls : undefined;
  }
  
  transformStreamingToolCalls(
    backendChunk: any,
    backendType: BackendType
  ): any {
    // For streaming, extract function calls from the chunk
    if (!backendChunk.candidates) return undefined;
    
    const toolCalls: any[] = [];
    
    for (const candidate of backendChunk.candidates) {
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.functionCall) {
            toolCalls.push({
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
    
    return toolCalls.length > 0 ? toolCalls : undefined;
  }
  
 private generateToolCallId(): string {
    return `call_${Math.random().toString(36).substring(2, 11)}`;
  }
}
```

### 2. Vertex Anthropic Tool Support

#### Anthropic Tool Format

Vertex Anthropic uses a different format for tool definitions:

```json
{
  "tools": [
    {
      "name": "get_current_weather",
      "description": "Get the current weather in a given location",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The city and state, e.g. San Francisco, CA"
          },
          "unit": {
            "type": "string",
            "enum": ["celsius", "fahrenheit"]
          }
        },
        "required": ["location"]
      }
    }
  ],
  "tool_choice": {
    "type": "auto"
  }
}
```

#### Anthropic Tool Handler Implementation

```typescript
class VertexAnthropicToolHandler implements ToolHandler {
  transformToolsToBackend(
    tools: OpenAIFunction[] | undefined,
    backendType: BackendType
  ): any {
    if (!tools || tools.length === 0) {
      return undefined;
    }
    
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }));
  }
  
  transformToolChoiceToBackend(
    toolChoice: OpenAIToolChoice | undefined,
    backendType: BackendType
 ): any {
    if (!toolChoice) {
      return undefined;
    }
    
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
  
  transformToolCallsFromBackend(
    backendResponse: any,
    backendType: BackendType
  ): Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }> | undefined {
    if (!backendResponse.content) return undefined;
    
    const allToolCalls: Array<{
      id: string;
      function: {
        name: string;
        arguments: string;
      };
      type: 'function';
    }> = [];
    
    for (const contentBlock of backendResponse.content) {
      if (contentBlock.type === 'tool_use') {
        allToolCalls.push({
          id: contentBlock.id,
          function: {
            name: contentBlock.name,
            arguments: JSON.stringify(contentBlock.input)
          },
          type: 'function'
        });
      }
    
    return allToolCalls.length > 0 ? allToolCalls : undefined;
  }
  
  transformStreamingToolCalls(
    backendChunk: any,
    backendType: BackendType
  ): any {
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
  }
}
```

## Tool Transformation Service

### Main Tool Transformation Service

```typescript
class ToolTransformationService {
  private handlers: Map<BackendType, ToolHandler>;
  
  constructor() {
    this.handlers = new Map();
    this.handlers.set('vertex-gemini', new VertexGeminiToolHandler());
    this.handlers.set('vertex-anthropic', new VertexAnthropicToolHandler());
  }
  
  // Transform tools from OpenAI to backend format
  transformToolsToBackend(
    tools: OpenAIFunction[] | undefined,
    backendType: BackendType
  ): any {
    const handler = this.handlers.get(backendType);
    if (!handler) {
      throw new Error(`No tool handler for backend type: ${backendType}`);
    }
    
    return handler.transformToolsToBackend(tools, backendType);
  }
  
  // Transform tool choice from OpenAI to backend format
  transformToolChoiceToBackend(
    toolChoice: OpenAIToolChoice | undefined,
    backendType: BackendType
  ): any {
    const handler = this.handlers.get(backendType);
    if (!handler) {
      throw new Error(`No tool handler for backend type: ${backendType}`);
    }
    
    return handler.transformToolChoiceToBackend(toolChoice, backendType);
  }
  
  // Transform tool calls from backend to OpenAI format
  transformToolCallsFromBackend(
    backendResponse: any,
    backendType: BackendType
  ): Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
    type: 'function';
  }> | undefined {
    const handler = this.handlers.get(backendType);
    if (!handler) {
      throw new Error(`No tool handler for backend type: ${backendType}`);
    }
    
    return handler.transformToolCallsFromBackend(backendResponse, backendType);
  }
  
  // Transform streaming tool calls
  transformStreamingToolCalls(
    backendChunk: any,
    backendType: BackendType
  ): any {
    const handler = this.handlers.get(backendType);
    if (!handler) {
      throw new Error(`No tool handler for backend type: ${backendType}`);
    }
    
    return handler.transformStreamingToolCalls(backendChunk, backendType);
  }
}
```

## Integration with Request/Response Transformers

### Request Transformer Integration

```typescript
class RequestTransformer {
  private toolService: ToolTransformationService;
  
  constructor() {
    this.toolService = new ToolTransformationService();
  }
  
  transformToBackend(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): any {
    // ... other transformations ...
    
    const backendRequest: any = {
      // ... existing fields ...
    };
    
    // Transform tools if present
    if (openaiRequest.tools) {
      backendRequest.tools = this.toolService.transformToolsToBackend(
        openaiRequest.tools,
        backendType
      );
    }
    
    // Transform tool choice if present
    if (openaiRequest.tool_choice) {
      const toolConfig = this.toolService.transformToolChoiceToBackend(
        openaiRequest.tool_choice,
        backendType
      );
      
      // Apply tool config based on backend requirements
      switch (backendType) {
        case 'vertex-gemini':
          if (toolConfig) {
            backendRequest.toolConfig = toolConfig;
          }
          break;
        case 'vertex-anthropic':
          if (toolConfig) {
            backendRequest.tool_choice = toolConfig;
          }
          break;
      }
    }
    
    return backendRequest;
  }
}
```

### Response Transformer Integration

```typescript
class ResponseTransformer {
  private toolService: ToolTransformationService;
  
 constructor() {
    this.toolService = new ToolTransformationService();
  }
  
  transformToOpenAI(
    backendResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionResponse {
    // ... other transformations ...
    
    const openaiResponse: OpenAIChatCompletionResponse = {
      // ... existing fields ...
      choices: [],
      usage: this.tokenTransformer.mapTokenCounts(backendResponse.usageMetadata || backendResponse.usage, backendType)
    };
    
    // Transform choices and include tool calls if present
    openaiResponse.choices = this.transformChoicesWithTools(
      backendResponse,
      backendType,
      originalRequest
    );
    
    return openaiResponse;
  }
  
  private transformChoicesWithTools(
    backendResponse: any,
    backendType: BackendType,
    originalRequest: OpenAIChatCompletionCreateParams
 ): any[] {
    // Get the base choices transformation
    const baseChoices = this.transformChoices(backendResponse, backendType);
    
    // Add tool calls if present in backend response
    const toolCalls = this.toolService.transformToolCallsFromBackend(
      backendResponse,
      backendType
    );
    
    if (toolCalls && toolCalls.length > 0) {
      // For now, add tool calls to the first choice
      // In practice, this would need more sophisticated handling
      if (baseChoices.length > 0) {
        baseChoices[0].message.tool_calls = toolCalls;
        baseChoices[0].finish_reason = 'tool_calls';
      }
    }
    
    return baseChoices;
  }
  
  // Streaming transformation with tools
  async *transformStreamToOpenAI(
    backendStream: AsyncIterable<any>,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    let choiceIndex = 0;
    
    for await (const chunk of backendStream) {
      const openaiChunk = this.transformChunkWithTools(
        chunk,
        choiceIndex,
        originalRequest,
        backendType
      );
      
      yield openaiChunk;
      choiceIndex++;
    }
  }
  
  private transformChunkWithTools(
    backendChunk: any,
    index: number,
    originalRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): OpenAIChatCompletionStreamResponse {
    const baseChunk = this.transformChunk(backendChunk, index, originalRequest, backendType);
    
    // Add tool calls to the chunk if present
    const toolCalls = this.toolService.transformStreamingToolCalls(
      backendChunk,
      backendType
    );
    
    if (toolCalls) {
      // Update the chunk with tool call information
      if (Array.isArray(toolCalls)) {
        // Multiple tool calls in this chunk
        for (const toolCall of toolCalls) {
          if (baseChunk.choices[toolCall.index]) {
            baseChunk.choices[toolCall.index].delta.tool_calls = [toolCall];
          }
        }
      } else {
        // Single tool call
        if (baseChunk.choices[toolCalls.index]) {
          baseChunk.choices[toolCalls.index].delta.tool_calls = [toolCalls];
        }
      }
    }
    
    return baseChunk;
  }
}
```

## Tool Call Validation

### Tool Schema Validation

```typescript
class ToolValidator {
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
```

## Error Handling for Tool Calls

### Tool-Specific Error Handling

```typescript
class ToolErrorHandler {
  // Transform tool-related errors to OpenAI format
 transformToolError(
    backendError: any,
    backendType: BackendType
  ): {
    status: number;
    error: {
      message: string;
      type: string;
      code?: string;
    };
  } {
    let status = 400; // Default to bad request for tool errors
    let message = 'Tool call error';
    let type = 'tool_error';
    let code: string | undefined;
    
    switch (backendType) {
      case 'vertex-gemini':
        if (backendError.details) {
          const toolError = backendError.details.find((detail: any) => 
            detail['@type']?.includes('BadRequest') || 
            detail['@type']?.includes('Tool')
          );
          
          if (toolError) {
            message = toolError.reason || toolError.message || message;
            code = toolError.errorCode || 'TOOL_ERROR';
          }
        }
        break;
        
      case 'vertex-anthropic':
        if (backendError.message) {
          message = backendError.message;
          if (message.includes('tool')) {
            type = 'invalid_tool_call';
          }
        }
        break;
    }
    
    return {
      status,
      error: {
        message,
        type,
        code
      }
    };
  }
}
```

## Performance Considerations

### 1. Schema Validation Performance

- Cache validated tool schemas
- Early validation to prevent unnecessary backend calls
- Asynchronous validation for complex schemas

### 2. Tool Call Processing

- Efficient transformation algorithms
- Proper handling of multiple tool calls in a single response
- Memory-efficient processing of tool arguments

### 3. Streaming Tool Calls

- Proper accumulation of streaming tool arguments
- Handling partial tool call data in streaming responses
- Efficient transformation of incremental tool data

This tool calls implementation provides comprehensive support for function calling across different backend providers while maintaining OpenAI compatibility.