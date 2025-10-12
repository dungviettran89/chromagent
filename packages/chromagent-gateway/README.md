# Chromagent Gateway

An OpenAI-compatible API gateway that routes requests to multiple backend LLM providers including Vertex Gemini, Vertex Anthropic, and Ollama.

## Overview

Chromagent Gateway provides a single OpenAI-compatible endpoint (`/v1/chat/completions`) that can route requests to multiple backend LLM providers. This allows you to:

- Use a single API interface for multiple LLM providers
- Easily switch between different models and providers
- Support both streaming and non-streaming requests
- Handle tool calls and function calling
- Process image inputs in messages
- Get accurate token usage reporting

## Features

- OpenAI-compatible API interface
- Support for Vertex Gemini API
- Support for Vertex Anthropic API  
- Support for Ollama API
- Streaming and non-streaming responses
- Tool calls and function calling
- Image input processing
- Token usage reporting
- Configurable routing rules
- Rate limiting and CORS support

## Installation

```bash
npm install @chromagen/gateway
```

## Usage

### As a Standalone Server

```bash
npx @chromagen/gateway --port 3000
```

Or programmatically:

```typescript
import { GatewayServer } from '@chromagen/gateway';

const config = {
  port: 3000,
  defaultBackend: 'vertex-gemini',
  backends: [
    {
      id: 'vertex-gemini',
      type: 'vertex-gemini',
      apiKey: process.env.GEMINI_API_KEY!,
      enabled: true
    },
    {
      id: 'ollama',
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      enabled: true
    }
  ]
};

const server = new GatewayServer(config);

server.start()
  .then(() => {
    console.log('Gateway server running on port 3000');
  })
  .catch(err => {
    console.error('Failed to start gateway:', err);
  });
```

### Making Requests

The gateway provides a fully OpenAI-compatible chat completions endpoint:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ]
  }'
```

## Configuration

The gateway can be configured with multiple backend providers:

```typescript
const config = {
  port: 3000,
  defaultBackend: 'vertex-gemini',
  backends: [
    {
      id: 'vertex-gemini',
      type: 'vertex-gemini',
      apiKey: 'your-gemini-api-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      enabled: true,
      modelMapping: {
        'gpt-4': 'gemini-1.5-pro',
        'gpt-3.5-turbo': 'gemini-1.0-pro'
      }
    },
    {
      id: 'vertex-anthropic',
      type: 'vertex-anthropic',
      apiKey: 'your-anthropic-api-key',
      baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1',
      enabled: true,
      modelMapping: {
        'gpt-4': 'claude-3-opus',
        'gpt-3.5-turbo': 'claude-3-haiku'
      }
    },
    {
      id: 'ollama-local',
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      enabled: true,
      modelMapping: {
        'gpt-4': 'llama3:latest',
        'gpt-3.5-turbo': 'phi3:latest'
      }
    }
  ],
  cors: {
    origin: '*',
    credentials: true
  },
  rateLimit: {
    windowMs: 900000, // 15 minutes
    max: 100
  }
};
```

## Supported Backends

### Vertex Gemini
- Full support for text and image inputs
- Function calling capabilities
- Streaming responses
- Accurate token usage reporting

### Vertex Anthropic
- Full support for text and image inputs
- Tool usage capabilities
- Streaming responses
- Accurate token usage reporting

### Ollama
- Support for locally hosted models
- Function calling capabilities
- Streaming responses
- Image input support for vision models

## API Endpoints

### Chat Completions
```
POST /v1/chat/completions
```

Supports all standard OpenAI parameters including:
- `model`: The model to use
- `messages`: Array of messages in the conversation
- `temperature`, `top_p`, `max_tokens`, etc.
- `tools` and `tool_choice` for function calling
- Streaming with `stream: true`

### Health Check
```
GET /health
```

Returns the health status of the gateway.

## Custom Backend Implementation

You can implement custom backends by implementing the `BackendProvider` interface:

```typescript
import { BackendProvider, BackendConfig } from '@chromagen/gateway';

class MyCustomBackend implements BackendProvider {
  type = 'my-custom-backend';
  
  async chatCompletion(request, config) {
    // Implement your custom logic here
    // Convert OpenAI request to your backend format
    // Call your backend API
    // Convert response back to OpenAI format
  }
  
  async *chatCompletionStream(request, config) {
    // Implement streaming logic
  }
  
  supportsStreaming() { return true; }
  supportsTools() { return true; }
  supportsImages() { return true; }
  
  validateConfig(config) {
    // Validate your configuration
    return { valid: true, errors: [] };
  }
}

// Register your custom backend
import { DefaultBackendRegistry } from '@chromagen/gateway';

const registry = new DefaultBackendRegistry();
registry.registerCustomBackend('my-custom-backend', MyCustomBackend);
```

## Environment Variables

- `GATEWAY_PORT`: Port to run the gateway on (default: 3000)
- `GATEWAY_HOST`: Host to bind to (default: localhost)
- `GATEWAY_CORS_ORIGIN`: CORS origin (default: *)
- `GATEWAY_RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds (default: 900000)
- `GATEWAY_RATE_LIMIT_MAX`: Max requests per rate limit window (default: 100)

## License

Apache 2.0