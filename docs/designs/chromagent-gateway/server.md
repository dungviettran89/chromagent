# Main Gateway Server Implementation Design

## Overview

This document outlines the design for the main gateway server using Express.js. The server will provide an OpenAI-compatible `/v1/chat/completions` endpoint that routes requests to various backend providers while maintaining OpenAI API compatibility.

## Server Architecture

### Express Server Structure

The gateway server will be built using Express.js with the following middleware and routing structure:

```typescript
class GatewayServer {
  private app: Express;
  private config: GatewayConfig;
  private backendRouter: BackendRouter;
  private requestTransformer: RequestTransformer;
  private responseTransformer: ResponseTransformer;
  
  constructor(config: GatewayConfig);
  start(): Promise<void>;
  setupMiddleware(): void;
 setupRoutes(): void;
  setupErrorHandling(): void;
}
```

### Core Dependencies

- `express`: Web framework for handling HTTP requests
- `node-fetch`: For making HTTP requests to backend providers (no external SDKs)
- `typescript`: Type safety throughout the implementation
- `cors`: Cross-origin resource sharing support
- `helmet`: Security headers
- `express-rate-limit`: Rate limiting capabilities

## Server Implementation Details

### 1. Server Initialization

```typescript
class GatewayServer {
 constructor(config: GatewayConfig) {
    this.config = config;
    this.app = express();
    this.backendRouter = new BackendRouter(config.backends);
    this.requestTransformer = new RequestTransformer();
    this.responseTransformer = new ResponseTransformer();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }
}
```

### 2. Middleware Setup

The server will implement several middleware functions:

```typescript
setupMiddleware(): void {
  // Security middleware
  this.app.use(helmet());
  
  // CORS support
  if (this.config.cors) {
    this.app.use(cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
    }));
  }
  
  // Body parsing
  this.app.use(express.json({ 
    limit: '10mb', // Support for image data
    type: ['application/json', 'text/plain'] 
  }));
  
  // Rate limiting
  if (this.config.rateLimit) {
    this.app.use(rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
    }));
  }
  
  // Request logging
  this.app.use(morgan('combined'));
}
```

### 3. Route Setup

The server will implement the main `/v1/chat/completions` route:

```typescript
setupRoutes(): void {
  // Health check endpoint
  this.app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // OpenAI-compatible chat completions endpoint
  this.app.post('/v1/chat/completions', async (req, res) => {
    try {
      await this.handleChatCompletions(req, res);
    } catch (error) {
      // Error will be handled by error middleware
      next(error);
    }
 });
  
  // Additional OpenAI-compatible endpoints (future)
  this.app.get('/v1/models', (req, res) => {
    // Return available models based on configured backends
  });
}
```

### 4. Chat Completions Handler

The main handler for the `/v1/chat/completions` endpoint will support both streaming and non-streaming requests:

```typescript
async handleChatCompletions(req: Request, res: Response): Promise<void> {
  try {
    // Validate request
    const openaiRequest = validateChatCompletionRequest(req.body);
    
    // Determine backend based on model or configuration
    const backendType = this.backendRouter.determineBackend(openaiRequest);
    const backend = this.backendRouter.getBackend(backendType);
    
    // Transform request to backend format
    const backendRequest = this.requestTransformer.transformToBackend(
      openaiRequest, 
      backendType
    );
    
    // Check if streaming is requested
    if (openaiRequest.stream) {
      await this.handleStreamingRequest(backend, backendRequest, res);
    } else {
      await this.handleNonStreamingRequest(backend, backendRequest, res);
    }
  } catch (error) {
    throw error; // Let error middleware handle it
  }
}
```

### 5. Non-Streaming Request Handler

```typescript
async handleNonStreamingRequest(
  backend: BackendProvider, 
  backendRequest: any, 
  res: Response
): Promise<void> {
  try {
    // Call backend
    const backendResponse = await backend.chatCompletion(backendRequest);
    
    // Transform response to OpenAI format
    const openaiResponse = this.responseTransformer.transformToOpenAI(
      backendResponse,
      req.body,
      backend.type
    );
    
    // Send response
    res.status(200).json(openaiResponse);
  } catch (error) {
    throw error;
  }
}
```

### 6. Streaming Request Handler

```typescript
async handleStreamingRequest(
  backend: BackendProvider, 
  backendRequest: any, 
  res: Response
): Promise<void> {
  try {
    // Set streaming response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Create backend stream
    const backendStream = backend.chatCompletionStream(backendRequest);
    
    // Transform and relay stream
    for await (const chunk of this.responseTransformer.transformStreamToOpenAI(
      backendStream,
      req.body,
      backend.type
    )) {
      // Send chunk as Server-Sent Events
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    
    // Send end marker
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    // For streaming errors, we need to send an error event
    res.write(`data: ${JSON.stringify({
      error: this.errorTransformer.transformBackendError(error, backend.type)
    })}\n\n`);
    res.end();
  }
}
```

## Server Configuration

### Configuration Options

```typescript
interface GatewayConfig {
  port: number;
  defaultBackend: BackendType;
  backends: Record<BackendType, BackendConfig>;
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  timeout: number; // Request timeout in milliseconds
  maxRetries: number; // Number of retries for failed requests
}
```

### Backend Configuration

```typescript
interface BackendConfig {
  apiKey: string;
  baseUrl?: string;
  additionalHeaders?: Record<string, string>;
  modelMapping?: Record<string, string>;
  enabled: boolean;
}
```

## Error Handling

### Global Error Handler

```typescript
setupErrorHandling(): void {
  // Global error handler
  this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Gateway Error:', error);
    
    // Transform error to OpenAI-compatible format
    const openaiError = this.errorTransformer.transformBackendError(
      error,
      req.body?.model || this.config.defaultBackend
    );
    
    res.status(openaiError.status).json({
      error: openaiError.error
    });
  });
  
  // 404 handler
  this.app.use('*', (req, res) => {
    res.status(404).json({
      error: {
        message: `The requested resource ${req.originalUrl} was not found`,
        type: 'invalid_request_error',
        code: 'resource_not_found'
      }
    });
  });
}
```

## Server Startup

### Start Method Implementation

```typescript
async start(): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = this.app.listen(this.config.port, () => {
      console.log(`Chromagent Gateway server running on port ${this.config.port}`);
      console.log(`Endpoint: http://localhost:${this.config.port}/v1/chat/completions`);
      resolve();
    });
    
    server.on('error', (error) => {
      console.error('Server error:', error);
      reject(error);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed.');
        process.exit(0);
      });
    });
  });
}
```

## Backend Provider Integration

### Backend Router

```typescript
class BackendRouter {
  private backends: Map<BackendType, BackendProvider>;
  
  constructor(backendConfigs: Record<BackendType, BackendConfig>) {
    this.backends = new Map();
    
    // Initialize each backend provider
    Object.entries(backendConfigs).forEach(([type, config]) => {
      if (config.enabled) {
        this.backends.set(type as BackendType, this.createBackendProvider(type as BackendType, config));
      }
    });
  }
  
  determineBackend(request: OpenAIChatCompletionCreateParams): BackendType {
    // If model is specified and matches a backend mapping, use that backend
    if (request.model) {
      for (const [backendType, config] of Object.entries(this.config.backends)) {
        if (config.modelMapping && request.model in config.modelMapping) {
          return backendType as BackendType;
        }
      }
    }
    
    // Otherwise use default backend
    return this.config.defaultBackend;
  }
  
  getBackend(type: BackendType): BackendProvider {
    const backend = this.backends.get(type);
    if (!backend) {
      throw new Error(`Backend provider ${type} not found or not enabled`);
    }
    return backend;
  }
  
  private createBackendProvider(type: BackendType, config: BackendConfig): BackendProvider {
    switch (type) {
      case 'vertex-gemini':
        return new VertexGeminiProvider(config);
      case 'vertex-anthropic':
        return new VertexAnthropicProvider(config);
      default:
        throw new Error(`Unsupported backend type: ${type}`);
    }
  }
}
```

## Server Features

### 1. Request Validation

The server will implement comprehensive request validation:

- Validate required fields in chat completion requests
- Validate message format and content
- Validate tool/function definitions
- Validate model names against available backends

### 2. Authentication

- API key validation using headers
- Support for multiple authentication methods per backend
- Automatic header forwarding to backends

### 3. Logging and Monitoring

- Request/response logging
- Performance metrics
- Error tracking
- Usage statistics

### 4. Health Checks

- Backend connectivity checks
- Response time monitoring
- Resource utilization tracking

## Security Considerations

### 1. Input Validation

- Sanitize all incoming requests
- Validate content length limits
- Check for malicious payloads

### 2. Rate Limiting

- Per-IP rate limiting
- Per-API key rate limiting
- Configurable limits

### 3. Authentication

- Secure API key storage
- Support for multiple authentication schemes
- Automatic key rotation support

## Performance Optimizations

### 1. Connection Pooling

- Maintain persistent connections to backend providers
- Reuse connections where possible
- Implement connection timeout handling

### 2. Caching

- Cache frequently requested model information
- Cache authentication validation results
- Implement response caching for idempotent requests

### 3. Memory Management

- Efficient streaming without buffering entire responses
- Proper cleanup of resources after requests
- Memory leak prevention in streaming implementations

This design provides a robust foundation for the Express.js-based gateway server that will handle OpenAI-compatible requests and route them to various backend providers while maintaining compatibility and performance.