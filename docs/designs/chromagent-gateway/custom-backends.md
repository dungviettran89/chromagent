# Custom Backend Implementations Design

## Overview

This document outlines the design for supporting custom backend implementations in the chromagent-gateway. The gateway should allow users to implement their own LLM backends while maintaining OpenAI compatibility through a well-defined interface.

## Custom Backend Architecture

### Backend Provider Interface

The foundation of custom backend support is a well-defined interface that all backends must implement:

```typescript
interface BackendProvider {
  // Type identifier for the backend
  type: string;
  
  // Process a non-streaming chat completion request
  chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse>;
  
  // Process a streaming chat completion request
  chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse>;
  
  // Check if the backend supports streaming
  supportsStreaming(): boolean;
  
 // Check if the backend supports tool/function calling
  supportsTools(): boolean;
  
 // Check if the backend supports image inputs
 supportsImages(): boolean;
  
  // Validate the backend configuration
 validateConfig(config: BackendConfig): { valid: boolean; errors: string[] };
}
```

### Backend Configuration Interface

```typescript
interface BackendConfig {
  // Unique identifier for this backend instance
  id: string;
  
 // API key or authentication information
  apiKey: string;
  
  // Base URL for the backend API
  baseUrl?: string;
  
  // Additional headers to include with requests
  additionalHeaders?: Record<string, string>;
  
  // Model mapping: map OpenAI model names to backend-specific names
  modelMapping?: Record<string, string>;
  
  // Custom configuration options for the specific backend
  customConfig?: Record<string, any>;
  
  // Whether this backend is enabled
  enabled: boolean;
}
```

## Custom Backend Implementation Examples

### 1. Simple HTTP Backend

A basic backend that calls a custom LLM API over HTTP:

```typescript
class SimpleHttpBackend implements BackendProvider {
  type = 'simple-http';
  
  async chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    // Transform the OpenAI request to the custom backend format
    const customRequest = this.transformRequest(request, config);
    
    // Make the API call
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...config.additionalHeaders
      },
      body: JSON.stringify(customRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    const customResponse = await response.json();
    
    // Transform the custom response to OpenAI format
    return this.transformResponse(customResponse, request);
  }
  
  async *chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    // Transform the OpenAI request to the custom backend format
    const customRequest = { ...this.transformRequest(request, config), stream: true };
    
    // Make the streaming API call
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        ...config.additionalHeaders
      },
      body: JSON.stringify(customRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
    }
    
    if (!response.body) {
      throw new Error('No response body for streaming request');
    }
    
    // Process the streaming response
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
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              if (jsonStr.trim() === '[DONE]') continue;
              
              const customChunk = JSON.parse(jsonStr);
              const openaiChunk = this.transformStreamResponse(customChunk, request);
              yield openaiChunk;
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
  }
  
  supportsStreaming(): boolean {
    return true;
  }
  
  supportsTools(): boolean {
    return true; // Depends on the specific backend
  }
  
  supportsImages(): boolean {
    return true; // Depends on the specific backend
  }
  
  validateConfig(config: BackendConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.baseUrl) {
      errors.push('Base URL is required');
    }
    
    if (!config.apiKey) {
      errors.push('API key is required');
    }
    
    try {
      new URL(config.baseUrl!);
    } catch {
      errors.push('Invalid base URL format');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private transformRequest(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
 ): any {
    // Map OpenAI request to custom backend format
    // This is backend-specific
    return {
      model: config.modelMapping?.[openaiRequest.model] || openaiRequest.model,
      messages: openaiRequest.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: openaiRequest.temperature,
      max_tokens: openaiRequest.max_tokens,
      stream: openaiRequest.stream
    };
  }
  
  private transformResponse(
    customResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    // Map custom backend response to OpenAI format
    return {
      id: customResponse.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: customResponse.choices?.[0]?.message?.content || null
        },
        finish_reason: customResponse.choices?.[0]?.finish_reason || 'stop'
      }],
      usage: {
        prompt_tokens: customResponse.usage?.prompt_tokens || 0,
        completion_tokens: customResponse.usage?.completion_tokens || 0,
        total_tokens: customResponse.usage?.total_tokens || 0
      }
    };
  }
  
  private transformStreamResponse(
    customChunk: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionStreamResponse {
    // Map custom backend stream chunk to OpenAI format
    return {
      id: customChunk.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        delta: {
          content: customChunk.choices?.[0]?.delta?.content || ''
        },
        finish_reason: customChunk.choices?.[0]?.finish_reason || null
      }]
    };
  }
}
```

### 2. Local Model Backend

A backend that interfaces with a locally running model:

```typescript
class LocalModelBackend implements BackendProvider {
  type = 'local-model';
  
  async chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    // For a local model, we might call a local API or directly interface with the model
    const modelPath = config.customConfig?.modelPath as string;
    const modelArgs = config.customConfig?.modelArgs as Record<string, any> || {};
    
    // This is a simplified example - in practice, this would interface with
    // a local model server like Ollama, vLLM, or similar
    const response = await this.callLocalModel(modelPath, request, modelArgs);
    
    return this.transformResponse(response, request);
  }
  
  async *chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    // Stream from local model
    const modelPath = config.customConfig?.modelPath as string;
    const modelArgs = config.customConfig?.modelArgs as Record<string, any> || {};
    
    // Interface with streaming from local model
    const stream = this.callLocalModelStream(modelPath, request, modelArgs);
    
    for await (const chunk of stream) {
      yield this.transformStreamResponse(chunk, request);
    }
 }
  
  supportsStreaming(): boolean {
    return true;
  }
  
  supportsTools(): boolean {
    return true; // Depends on the local model capabilities
  }
  
  supportsImages(): boolean {
    return false; // Many local models don't support images
  }
  
  validateConfig(config: BackendConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!config.customConfig?.modelPath) {
      errors.push('Model path is required for local model backend');
    }
    
    // Additional validation for local model config
    if (config.customConfig?.modelPath && typeof config.customConfig.modelPath !== 'string') {
      errors.push('Model path must be a string');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private async callLocalModel(
    modelPath: string,
    request: OpenAIChatCompletionCreateParams,
    args: Record<string, any>
  ): Promise<any> {
    // Implementation would depend on the specific local model interface
    // This could be an HTTP call to a local server, or direct model API calls
    const requestBody = {
      model: modelPath,
      messages: request.messages,
      ...args
    };
    
    const response = await fetch('http://localhost:11434/api/generate', { // Example for Ollama
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    return response.json();
  }
  
  private async *callLocalModelStream(
    modelPath: string,
    request: OpenAIChatCompletionCreateParams,
    args: Record<string, any>
 ): AsyncIterable<any> {
    // Implementation for streaming from local model
    const requestBody = {
      model: modelPath,
      messages: request.messages,
      stream: true,
      ...args
    };
    
    const response = await fetch('http://localhost:11434/api/generate', { // Example for Ollama
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.body) {
      throw new Error('No response body for streaming request');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            const parsed = JSON.parse(line);
            yield parsed;
          } catch (e) {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  private transformResponse(
    localResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionResponse {
    // Transform local model response to OpenAI format
    return {
      id: localResponse.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: localResponse.response || localResponse.content || null
        },
        finish_reason: localResponse.done ? 'stop' : 'length'
      }],
      usage: {
        prompt_tokens: localResponse.prompt_eval_count || 0,
        completion_tokens: localResponse.eval_count || 0,
        total_tokens: (localResponse.prompt_eval_count || 0) + (localResponse.eval_count || 0)
      }
    };
  }
  
  private transformStreamResponse(
    localChunk: any,
    originalRequest: OpenAIChatCompletionCreateParams
  ): OpenAIChatCompletionStreamResponse {
    // Transform local model stream chunk to OpenAI format
    return {
      id: localChunk.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        delta: {
          content: localChunk.response || localChunk.content || ''
        },
        finish_reason: localChunk.done ? 'stop' : null
      }]
    };
  }
}

### 3. Ollama Backend

A backend that interfaces with a locally running Ollama server:

```typescript
class OllamaBackendProvider implements BackendProvider {
  type = 'ollama';
  
  async chatCompletion(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
  ): Promise<OpenAIChatCompletionResponse> {
    const ollamaRequest = this.transformToOllama(request, config);
    
    const response = await fetch(`${config.baseUrl || 'http://localhost:11434'}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const ollamaResponse = await response.json();
    
    return this.transformFromOllama(ollamaResponse, request);
 }
  
  async *chatCompletionStream(
    request: OpenAIChatCompletionCreateParams,
    config: BackendConfig
 ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    const ollamaRequest = {
      ...this.transformToOllama(request, config),
      stream: true
    };
    
    const response = await fetch(`${config.baseUrl || 'http://localhost:11434'}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest)
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    if (!response.body) {
      throw new Error('No response body for streaming request');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            const parsed = JSON.parse(line);
            
            // Convert Ollama response to OpenAI stream format
            const openaiChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: request.model,
              choices: [{
                index: 0,
                delta: {
                  content: parsed.message?.content || ''
                },
                finish_reason: parsed.done ? 'stop' : null
              }]
            };
            
            yield openaiChunk;
            
            if (parsed.done) break;
          } catch (e) {
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
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
  
  private transformToOllama(
    openaiRequest: OpenAIChatCompletionCreateParams,
    config: BackendConfig
 ): any {
    // Map OpenAI messages to Ollama format
    const messages = openaiRequest.messages.map(msg => {
      const ollamaMsg: any = {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content :
                 Array.isArray(msg.content) ? msg.content
                   .filter(item => item.type === 'text')
                   .map(item => (item as any).text)
                   .join(' ') : ''
      };
      
      // Handle images in content
      if (Array.isArray(msg.content)) {
        const images = msg.content
          .filter(item => item.type === 'image_url')
          .map(item => (item as any).image_url.url);
        
        if (images.length > 0) {
          // For Ollama, we need to handle base64 encoded images
          ollamaMsg.images = images;
        }
      }
      
      return ollamaMsg;
    });
    
    return {
      model: config.modelMapping?.[openaiRequest.model] || openaiRequest.model,
      messages,
      options: {
        temperature: openaiRequest.temperature,
        top_p: openaiRequest.top_p,
        max_tokens: openaiRequest.max_tokens
      },
      stream: openaiRequest.stream || false
    };
  }
  
 private transformFromOllama(
    ollamaResponse: any,
    originalRequest: OpenAIChatCompletionCreateParams
 ): OpenAIChatCompletionResponse {
    return {
      id: ollamaResponse.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: originalRequest.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: ollamaResponse.message?.content || ollamaResponse.response || null
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: ollamaResponse.prompt_eval_count || 0,
        completion_tokens: ollamaResponse.eval_count || 0,
        total_tokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0)
      }
    };
  }
}
```

## Backend Registration System

### Backend Registry

A registry system to manage and access different backend implementations:

```typescript
class BackendRegistry {
  private backends: Map<string, new () => BackendProvider> = new Map();
  private instances: Map<string, BackendProvider> = new Map();
  
  // Register a new backend type
  registerBackend(type: string, backendClass: new () => BackendProvider): void {
    this.backends.set(type, backendClass);
  }
  
  // Create an instance of a backend
  createBackend(type: string): BackendProvider | null {
    const BackendClass = this.backends.get(type);
    if (!BackendClass) {
      return null;
    }
    
    return new BackendClass();
  }
  
  // Get a backend instance by type
  getBackend(type: string): BackendProvider | null {
    if (!this.instances.has(type)) {
      const backend = this.createBackend(type);
      if (backend) {
        this.instances.set(type, backend);
      }
    }
    
    return this.instances.get(type) || null;
  }
  
  // List all registered backend types
  listBackendTypes(): string[] {
    return Array.from(this.backends.keys());
  }
}
```

### Default Registry Setup

```typescript
class DefaultBackendRegistry extends BackendRegistry {
  constructor() {
    super();
    
    // Register built-in backends
   this.registerBackend('vertex-gemini', VertexGeminiBackendProvider);
   this.registerBackend('vertex-anthropic', VertexAnthropicBackendProvider);
   this.registerBackend('ollama', OllamaBackendProvider);
   
   // Users can register custom backends via API
 }
  
  // API for users to register custom backends
  registerCustomBackend(type: string, backendClass: new () => BackendProvider): void {
    if (this.backends.has(type)) {
      throw new Error(`Backend type '${type}' is already registered`);
    }
    
    this.registerBackend(type, backendClass);
  }
}
```

## Backend Router

### Intelligent Backend Routing

A system to route requests to appropriate backends based on various criteria:

```typescript
class BackendRouter {
  private registry: DefaultBackendRegistry;
  private configs: Map<string, BackendConfig>;
  
  constructor(registry: DefaultBackendRegistry, configs: BackendConfig[]) {
    this.registry = registry;
    this.configs = new Map();
    
    // Initialize configs
    for (const config of configs) {
      this.configs.set(config.id, config);
    }
  }
  
  // Determine which backend to use for a request
 determineBackend(request: OpenAIChatCompletionCreateParams): { backend: BackendProvider; config: BackendConfig } | null {
   // Find all backends that can handle the requested model
   const suitableBackends: Array<{ backend: BackendProvider; config: BackendConfig }> = [];
   
   // First, check for backends with explicit model mapping
   for (const [configId, config] of this.configs) {
     if (!config.enabled) continue;
     
     const backend = this.registry.getBackend(configId);
     if (!backend) continue;
     
     // Check if this backend explicitly supports the requested model
     if (config.modelMapping && request.model in config.modelMapping) {
       // Check if request requires specific features
       const requiresTools = !!(request.tools || request.tool_choice);
       const requiresImages = this.requestRequiresImages(request);
       
       if (requiresTools && !backend.supportsTools()) continue;
       if (requiresImages && !backend.supportsImages()) continue;
       
       suitableBackends.push({ backend, config: this.configs.get(configId)! });
     }
   }
   
   // If no explicitly mapped backends found, check for backends that might support the model generally
   if (suitableBackends.length === 0) {
     for (const [configId, config] of this.configs) {
       if (!config.enabled) continue;
       
       const backend = this.registry.getBackend(configId);
       if (!backend) continue;
       
       // Check if request requires specific features
       const requiresTools = !!(request.tools || request.tool_choice);
       const requiresImages = this.requestRequiresImages(request);
       
       if (requiresTools && !backend.supportsTools()) continue;
       if (requiresImages && !backend.supportsImages()) continue;
       
       suitableBackends.push({ backend, config: this.configs.get(configId)! });
     }
   }
   
   // If still no suitable backends, try default
   if (suitableBackends.length === 0) {
     const defaultConfig = Array.from(this.configs.values()).find(c => c.id === 'default' && c.enabled);
     if (defaultConfig) {
       const backend = this.registry.getBackend(defaultConfig.id);
       if (backend) {
         return { backend, config: defaultConfig };
       }
     }
     
     // If no suitable backend found, return null
     return null;
   }
   
   // Implement round-robin selection among suitable backends
   const selectedBackend = this.roundRobinSelect(suitableBackends, request.model);
   return selectedBackend;
 }
 
 private roundRobinIndex: Map<string, number> = new Map(); // Per-model round-robin tracking
 
 private roundRobinSelect(
   backends: Array<{ backend: BackendProvider; config: BackendConfig }>,
   model: string
 ): { backend: BackendProvider; config: BackendConfig } {
   const currentIndex = this.roundRobinIndex.get(model) || 0;
   const selected = backends[currentIndex % backends.length];
   
   // Update the index for next request for this model
   this.roundRobinIndex.set(model, currentIndex + 1);
   
   return selected;
 }
  
  private requestRequiresImages(request: OpenAIChatCompletionCreateParams): boolean {
    for (const message of request.messages) {
      if (typeof message.content !== 'string' && Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'image_url') {
            return true;
          }
        }
      }
    }
    return false;
  }
}
```

## Backend Configuration Management

### Configuration Schema

```typescript
interface GatewayBackendConfig {
  // Default backend to use when no specific routing rules apply
  defaultBackend: string;
  
  // Configuration for all available backends
  backends: BackendConfig[];
  
  // Routing rules for directing requests to specific backends
  routingRules?: Array<{
    condition: string; // e.g., "model: gpt-4", "has_tools: true", etc.
    backendId: string;
  }>;
}
```

### Configuration Validation

```typescript
class BackendConfigValidator {
  validate(config: GatewayBackendConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate default backend exists
    if (!config.defaultBackend) {
      errors.push('Default backend is required');
    } else if (!config.backends.some(b => b.id === config.defaultBackend)) {
      errors.push(`Default backend '${config.defaultBackend}' not found in backend list`);
    }
    
    // Validate each backend config
    for (const backend of config.backends) {
      if (!backend.id) {
        errors.push('Backend ID is required');
      }
      
      if (!backend.type) {
        errors.push(`Backend ${backend.id || 'unknown'}: Type is required`);
      }
      
      // Validate using the backend's own validation method
      const registry = new DefaultBackendRegistry();
      const backendProvider = registry.createBackend(backend.type);
      if (backendProvider) {
        const validation = backendProvider.validateConfig(backend);
        if (!validation.valid) {
          errors.push(`Backend ${backend.id}: ${validation.errors.join(', ')}`);
        }
      }
    }
    
    // Validate routing rules
    if (config.routingRules) {
      for (const rule of config.routingRules) {
        if (!rule.condition) {
          errors.push('Routing rule condition is required');
        }
        if (!rule.backendId) {
          errors.push('Routing rule backend ID is required');
        }
        
        // Check if backend ID exists
        if (!config.backends.some(b => b.id === rule.backendId)) {
          errors.push(`Routing rule references non-existent backend: ${rule.backendId}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## Implementation Guidelines for Custom Backends

### Best Practices

1. **Error Handling**: Always implement proper error handling and convert backend-specific errors to OpenAI-compatible errors.

2. **Performance**: Implement efficient streaming when possible, and avoid buffering entire responses in memory.

3. **Validation**: Validate configuration parameters during initialization.

4. **Feature Detection**: Properly report which features your backend supports (streaming, tools, images).

5. **Security**: Never expose sensitive information in error messages.

### Required Methods

Each custom backend must implement:

1. `chatCompletion()` - For non-streaming requests
2. `chatCompletionStream()` - For streaming requests
3. `supportsStreaming()` - Feature detection
4. `supportsTools()` - Feature detection
5. `supportsImages()` - Feature detection
6. `validateConfig()` - Configuration validation

### Optional Enhancements

1. **Caching**: Implement response caching for better performance
2. **Rate Limiting**: Handle rate limiting appropriately
3. **Load Balancing**: Support multiple instances of the same backend
4. **Monitoring**: Provide metrics and logging capabilities

## Integration with Gateway Server

### Using Custom Backends in the Gateway

```typescript
class GatewayServer {
  private backendRouter: BackendRouter;
  
  constructor(config: GatewayConfig) {
    // Initialize with user-provided backends
    const registry = new DefaultBackendRegistry();
    
    // User can register custom backends before initializing
    this.registerCustomBackends(registry, config.customBackends);
    
    // Create router with configurations
    this.backendRouter = new BackendRouter(registry, config.backends);
  }
  
  private registerCustomBackends(
    registry: DefaultBackendRegistry,
    customBackends?: Array<{ type: string; class: new () => BackendProvider }>
  ): void {
    if (!customBackends) return;
    
    for (const backend of customBackends) {
      registry.registerCustomBackend(backend.type, backend.class);
    }
  }
  
  // Method to handle chat completions using the routed backend
  async handleChatCompletion(
    request: OpenAIChatCompletionCreateParams
  ): Promise<OpenAIChatCompletionResponse> {
    const routingResult = this.backendRouter.determineBackend(request);
    if (!routingResult) {
      throw new Error('No suitable backend found for the request');
    }
    
    const { backend, config } = routingResult;
    return backend.chatCompletion(request, config);
  }
  
  // Method to handle streaming chat completions
  async *handleChatCompletionStream(
    request: OpenAIChatCompletionCreateParams
  ): AsyncIterable<OpenAIChatCompletionStreamResponse> {
    const routingResult = this.backendRouter.determineBackend(request);
    if (!routingResult) {
      throw new Error('No suitable backend found for the request');
    }
    
    const { backend, config } = routingResult;
    yield* backend.chatCompletionStream(request, config);
  }
}
```

This custom backend implementation design provides a flexible and extensible system that allows users to integrate their own LLM backends while maintaining OpenAI compatibility throughout the chromagent-gateway.