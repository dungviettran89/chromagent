# Chromagent Gateway Usage Documentation

## Overview

The Chromagent Gateway provides an OpenAI-compatible API endpoint that routes requests to multiple backend LLM providers. This document explains how to install, configure, and use the package.

## Installation

### Prerequisites

- Node.js 18 or higher
- npm or yarn package manager

### Installing the Package

```bash
# Using npm
npm install chromagent-gateway

# Using yarn
yarn add chromagent-gateway
```

## Configuration

### Environment Variables

The gateway can be configured using environment variables:

```bash
# Server configuration
GATEWAY_PORT=3000
GATEWAY_HOST=localhost

# CORS settings
GATEWAY_CORS_ORIGIN=*
GATEWAY_CORS_CREDENTIALS=true

# Rate limiting
GATEWAY_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
GATEWAY_RATE_LIMIT_MAX=100

# Request timeout
GATEWAY_TIMEOUT=30000  # 30 seconds
```

### Configuration File

You can also configure the gateway using a JSON configuration file:

```json
{
  "port": 3000,
  "host": "localhost",
  "defaultBackend": "vertex-gemini",
  "backends": [
    {
      "id": "vertex-gemini",
      "type": "vertex-gemini",
      "apiKey": "your-gemini-api-key",
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "enabled": true,
      "modelMapping": {
        "gpt-4": "gemini-1.5-pro",
        "gpt-3.5-turbo": "gemini-1.0-pro"
      },
      "additionalHeaders": {}
    },
    {
      "id": "vertex-anthropic",
      "type": "vertex-anthropic",
      "apiKey": "your-anthropic-api-key",
      "baseUrl": "https://us-central1-aiplatform.googleapis.com/v1",
      "projectId": "your-project-id",
      "enabled": true,
      "modelMapping": {
        "gpt-4": "claude-3-opus",
        "gpt-3.5-turbo": "claude-3-haiku"
      },
      "additionalHeaders": {
        "anthropic-version": "2023-06-01"
      }
    }
  ],
  "cors": {
    "origin": "*",
    "credentials": true
  },
  "rateLimit": {
    "windowMs": 900000,
    "max": 100
  },
  "timeout": 30000
}
```

## Usage

### As a Standalone Server

#### Command Line

```bash
# Start the server with default settings
npx chromagent-gateway

# Start with a configuration file
npx chromagent-gateway --config /path/to/config.json

# Start with specific port
npx chromagent-gateway --port 8080
```

#### Programmatic Usage

```typescript
import { GatewayServer } from 'chromagent-gateway';

const config = {
  port: 3000,
  defaultBackend: 'vertex-gemini',
  backends: [
    {
      id: 'vertex-gemini',
      type: 'vertex-gemini',
      apiKey: process.env.GEMINI_API_KEY!,
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

### As a Library

```typescript
import { GatewayClient } from 'chromagent-gateway';

// Create a client to use the gateway functionality programmatically
const client = new GatewayClient({
  baseUrl: 'http://localhost:3000'
});

// Make requests directly through the gateway
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello, world!' }]
});

console.log(response.choices[0].message.content);
```

## API Endpoints

### Chat Completions

The gateway provides a fully OpenAI-compatible chat completions endpoint:

```
POST /v1/chat/completions
```

#### Request Body

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 150,
  "stream": false
}
```

#### Response Format

The response follows the OpenAI API format:

```json
{
  "id": "chatcmpl-123456789",
  "object": "chat.completion",
  "created": 167765228,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "I'm doing well, thank you for asking!"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 10,
    "total_tokens": 25
  }
}
```

### Streaming Responses

To receive streaming responses, set `"stream": true` in your request:

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Count to 3: 1, 2, "
    }
  ],
  "stream": true
}
```

The gateway will return Server-Sent Events (SE) formatted responses:

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk",...}

data: {"id":"chatcmpl-124","object":"chat.completion.chunk",...}

data: [DONE]
```

### Tool Calling

The gateway supports OpenAI-compatible function calling:

```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "What's the weather like in Paris?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
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
    }
  ],
  "tool_choice": "auto"
}
```

### Image Inputs

The gateway supports image inputs in the OpenAI format:

```json
{
  "model": "gpt-4-vision",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg",
            "detail": "auto"
          }
        }
      ]
    }
  ]
}
```

## Backend Configuration

### Vertex Gemini

To configure Vertex Gemini as a backend:

```json
{
 "id": "my-gemini-backend",
  "type": "vertex-gemini",
  "apiKey": "your-api-key",
  "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
  "enabled": true,
  "modelMapping": {
    "gpt-4": "gemini-1.5-pro",
    "gpt-3.5-turbo": "gemini-1.0-pro"
  }
}
```

### Vertex Anthropic

To configure Vertex Anthropic as a backend:

```json
{
  "id": "my-anthropic-backend",
  "type": "vertex-anthropic",
  "apiKey": "your-api-key",
  "baseUrl": "https://us-central1-aiplatform.googleapis.com/v1",
  "projectId": "your-project-id",
  "enabled": true,
  "modelMapping": {
    "gpt-4": "claude-3-opus",
    "gpt-3.5-turbo": "claude-3-haiku"
  },
  "additionalHeaders": {
    "anthropic-version": "2023-06-01"
  }
}

### Ollama

To configure Ollama as a backend:

```json
{
  "id": "ollama-local",
  "type": "ollama",
  "baseUrl": "http://localhost:11434",
  "enabled": true,
  "modelMapping": {
    "gpt-4": "llama3:latest",
    "gpt-3.5-turbo": "phi3:latest"
  }
}
```

### Custom Backend
```

### Ollama Backend

To configure Ollama as a backend:

```json
{
  "id": "ollama-local",
  "type": "ollama",
  "baseUrl": "http://localhost:11434",
  "enabled": true,
  "modelMapping": {
    "gpt-4": "llama3:latest",
    "gpt-3.5-turbo": "phi3:latest"
  }
}
```

Ollama is a built-in backend that allows you to run local LLMs. Make sure you have Ollama installed and running on your system before configuring this backend.

### Custom Backend

To implement a custom backend, extend the `BackendProvider` interface:

```typescript
import { BackendProvider, BackendConfig } from 'chromagent-gateway';

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
  supportsImages() { return false; }
  
  validateConfig(config) {
    // Validate your configuration
    return { valid: true, errors: [] };
  }
}

// Register your custom backend
import { DefaultBackendRegistry } from 'chromagent-gateway';

const registry = new DefaultBackendRegistry();
registry.registerCustomBackend('my-custom-backend', MyCustomBackend);
```

## Routing Rules

The gateway can route requests to different backends based on various criteria:

```json
{
 "defaultBackend": "vertex-gemini",
  "routingRules": [
    {
      "condition": "model: claude-*",
      "backendId": "vertex-anthropic"
    },
    {
      "condition": "has_tools: true",
      "backendId": "vertex-gemini"
    },
    {
      "condition": "has_images: true",
      "backendId": "vertex-gemini"
    }
 ]
}
```

## Load Balancing with Round-Robin

When multiple backends are configured to provide the same model (e.g., multiple instances of Vertex Gemini configured for "gpt-4"), the gateway automatically implements round-robin load balancing. This distributes requests evenly across all available backends that support the requested model:

```json
{
  "defaultBackend": "vertex-gemini",
  "backends": [
    {
      "id": "vertex-gemini-1",
      "type": "vertex-gemini",
      "apiKey": "api-key-1",
      "enabled": true,
      "modelMapping": {
        "gpt-4": "gemini-1.5-pro"
      }
    },
    {
      "id": "vertex-gemini-2",
      "type": "vertex-gemini",
      "apiKey": "api-key-2",
      "enabled": true,
      "modelMapping": {
        "gpt-4": "gemini-1.5-pro"
      }
    }
  ]
}
```

In this configuration, requests for "gpt-4" will be distributed in a round-robin fashion between the two Gemini backends, providing load distribution and increased availability.
```

## Error Handling

The gateway returns OpenAI-compatible error responses:

```json
{
  "error": {
    "message": "The model `invalid-model` does not exist",
    "type": "invalid_request_error",
    "param": null,
    "code": "model_not_found"
  }
}
```

Common error types:
- `invalid_request_error`: Invalid request parameters
- `authentication_error`: Authentication failure
- `rate_limit_error`: Rate limit exceeded
- `api_error`: Backend API error

## Monitoring and Logging

### Health Check

Check the gateway status:

```
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2023-10-07T12:34:56.789Z",
  "version": "1.0.0"
}
```

### Metrics

Access usage metrics:

```
GET /metrics
```

## Security

### API Keys

The gateway doesn't require its own API keys but relies on the backend provider keys configured in the backend configuration.

### Rate Limiting

Rate limiting is configured in the settings and applies per IP address by default.

### CORS

Configure CORS settings to control which origins can access the gateway.

## Performance Considerations

### Caching

For high-performance scenarios, consider implementing response caching between the gateway and clients.

### Connection Pooling

The gateway manages connections to backend providers efficiently, but you may need to tune settings based on your usage patterns.

### Streaming

Streaming responses are handled efficiently without buffering entire responses in memory.

## Examples

### Basic Usage

```javascript
// Simple chat completion
const response = await fetch('http://localhost:3000/v1/chat/completions', {
 method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Hello, world!' }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### With Streaming

```javascript
// Streaming example
const response = await fetch('http://localhost:3000/v1/chat/completions', {
 method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Write a short poem' }
    ],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0].delta?.content) {
            process.stdout.write(parsed.choices[0].delta.content);
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }
  }
} finally {
 reader.releaseLock();
}
```

### With Tools

```javascript
// Tool calling example
const response = await fetch('http://localhost:3000/v1/chat/completions', {
 method: 'POST',
  headers: {
    'Content-Type': 'application/json'
 },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'What is the weather in Tokyo?' }
    ],
    tools: [{
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get weather information for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          },
          required: ['location']
        }
      }
    }],
    tool_choice: 'auto'
 })
});

const data = await response.json();
console.log('Tool calls:', data.choices[0].message.tool_calls);
```

This usage documentation provides comprehensive guidance on how to install, configure, and use the Chromagent Gateway package for various scenarios.