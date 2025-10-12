# Chromagent Gateway Design Document

## Overview

The Chromagent Gateway is a new package that provides an OpenAI-compatible API endpoint for the chat completions endpoint. It acts as a gateway that can route requests to multiple backend LLM providers, including Vertex Gemini API, Vertex Anthropic API, and custom LLM implementations. The gateway transforms requests and responses to maintain OpenAI compatibility while supporting various backend providers.

## Goals

- Provide a single OpenAI-compatible endpoint (`/v1/chat/completions`) that can route to multiple backend providers
- Support streaming and non-streaming responses
- Support tool calls and function calling
- Support image inputs in messages
- Provide accurate token usage reporting
- Include built-in converters for Vertex Gemini, Vertex Anthropic, and Ollama APIs
- Allow custom backend implementations
- Avoid external SDKs, using fetch API and custom typings only
- Support both standalone server mode and library integration

## Architecture

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   OpenAI        │    │   Chromagent         │    │   Backend       │
│   Client        │───▶│   Gateway            │───▶│   Providers     │
│                 │    │                      │    │                 │
│   (Compatible   │    │   - Request Router   │    │   - Vertex      │
│   API)          │    │   - Response         │    │     Gemini      │
│                 │    │     Transformer      │    │   - Vertex      │
│                 │    │   - Stream Handler   │    │     Anthropic   │
│                 │    │   - Token Counter    │    │   - Ollama      │
│                 │    │                      │    │   - Custom      │
└─────────────────┘    └──────────────────────┘    │     Backend     │
                                                └─────────────────┘
```

## Package Structure

```
packages/chromagent-gateway/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── server.ts               # Express server implementation
│   ├── types/                  # Type definitions
│   │   ├── openai.ts           # OpenAI-compatible types
│   │   ├── backends.ts         # Backend provider types
│   │   └── gateway.ts          # Gateway-specific types
│   ├── backends/               # Backend provider implementations
│   │   ├── vertex-gemini.ts    # Vertex Gemini converter
│   │   ├── vertex-anthropic.ts # Vertex Anthropic converter
│   │   ├── ollama.ts           # Ollama converter
│   │   └── base.ts             # Base backend interface
│   ├── middleware/             # Express middleware
│   │   ├── cors.ts
│   │   └── errorHandler.ts
│   ├── utils/                  # Utility functions
│   │   ├── stream.ts           # Streaming utilities
│   │   ├── token.ts            # Token counting utilities
│   │   └── transformer.ts      # Request/response transformers
│   └── routes/                 # API routes
│       └── chat.ts             # Chat completions route
├── test/                       # Test files
├── package.json
├── tsconfig.json
└── README.md
```

## Core Components

### 1. OpenAI-Compatible Types

The gateway will define comprehensive type definitions that match the OpenAI API specification for chat completions, including:

- Request types for chat completions (with support for messages, tools, streaming, etc.)
- Response types for both streaming and non-streaming responses
- Error response types

### 2. Backend Provider Interface

A base interface that all backend providers must implement:

```typescript
interface BackendProvider {
  // Process a chat completion request
  chatCompletion(request: OpenAIChatCompletionCreateParams): Promise<OpenAIChatCompletionResponse>;
  
  // Process a streaming chat completion request
  chatCompletionStream(request: OpenAIChatCompletionCreateParams): AsyncIterable<OpenAIChatCompletionStreamResponse>;
}
```

### 3. Request/Response Transformers

Utility functions to convert between OpenAI format and backend-specific formats:

- Request transformers: Convert OpenAI requests to backend-specific formats
- Response transformers: Convert backend responses to OpenAI-compatible format
- Streaming transformers: Handle streaming response conversion

### 4. Main Gateway Server

An Express-based server that:

- Exposes the `/v1/chat/completions` endpoint
- Routes requests to appropriate backend providers based on configuration
- Handles both streaming and non-streaming requests
- Manages authentication and rate limiting
- Provides health check endpoints

## Supported Features

### 1. Streaming Responses

The gateway will support both streaming and non-streaming responses:

- For streaming requests (`stream: true`), the gateway will establish a streaming connection with the backend and relay events to the client
- For non-streaming requests, the gateway will collect the full response and return it as a single response

### 2. Tool Calls

The gateway will support OpenAI-style function calling:

- Conversion between OpenAI tools format and backend-specific tool formats
- Proper handling of tool call responses in both streaming and non-streaming modes
- Support for multiple tool calls in a single response

### 3. Image Inputs

Support for image inputs in chat messages:

- Base64-encoded image data in messages
- Proper MIME type handling
- Conversion to backend-specific image formats

### 4. Token Usage

Accurate token usage reporting:

- Tracking input tokens, output tokens, and total tokens
- Proper mapping between OpenAI token counts and backend token counts
- Including usage information in responses

## Built-in Backend Converters

### 1. Vertex Gemini API Converter

Converts OpenAI chat completion requests to Google Vertex Gemini API format:

- Maps OpenAI message format to Vertex content format
- Converts tools/functions to Vertex function declarations
- Handles image inputs by converting to Vertex inline data format
- Maps response formats back to OpenAI-compatible format
- Transforms streaming responses to OpenAI-compatible streaming format

### 2. Vertex Anthropic API Converter

Converts OpenAI chat completion requests to Google Vertex Anthropic API format:

- Maps OpenAI message format to Anthropic message format
- Converts tools/functions to Anthropic tool format
- Handles image inputs by converting to Anthropic image format
- Maps response formats back to OpenAI-compatible format
- Transforms streaming responses to OpenAI-compatible streaming format

### 3. Ollama API Converter

Converts OpenAI chat completion requests to Ollama API format:

- Maps OpenAI message format to Ollama message format
- Converts tools/functions to Ollama tool format
- Handles image inputs by converting to Ollama image format
- Maps response formats back to OpenAI-compatible format
- Transforms streaming responses to OpenAI-compatible streaming format

## Custom Backend Support

The gateway will allow users to implement their own backend providers by implementing the `BackendProvider` interface. This enables:

- Integration with proprietary LLMs
- Custom processing logic
- Specialized authentication methods
- Custom response formatting

## Configuration

The gateway will support configuration through:

- Environment variables
- Configuration file
- Runtime configuration options when used as a library

Configuration options will include:

- Backend provider selection and configuration
- API keys for different providers
- Default model settings
- Rate limiting options
- CORS settings

## Error Handling

The gateway will implement comprehensive error handling:

- Proper mapping of backend errors to OpenAI-compatible error formats
- Graceful degradation when backends are unavailable
- Detailed logging for debugging
- Client-friendly error messages

## Security Considerations

- Input validation and sanitization
- Authentication and API key management
- Rate limiting to prevent abuse
- CORS configuration for web-based clients
- Protection against prompt injection attacks

## Performance Considerations

- Efficient streaming without buffering entire responses
- Connection pooling for backend requests
- Caching of frequently used configurations
- Proper memory management during streaming

## Testing Strategy

- Unit tests for request/response transformers
- Integration tests with mock backend providers
- End-to-end tests for the complete request flow
- Performance tests for streaming scenarios
- Error handling tests

## Deployment Options

The gateway can be deployed as:

1. Standalone server using Node.js
2. Docker container
3. Library integrated into other applications
4. Cloud function or containerized service

## Future Enhancements

- Support for additional backend providers (OpenAI, other models)
- Advanced routing based on model capabilities
- Load balancing across multiple instances of the same backend
- Advanced caching mechanisms
- Monitoring and analytics integration
- Support for additional OpenAI API endpoints (completions, embeddings, etc.)