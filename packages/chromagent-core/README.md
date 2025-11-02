# Chromagent Core

Chromagent Core provides core functionality for connecting to various LLMs (Large Language Models) through standardized
interfaces. It includes implementations for Anthropic and Google Vertex AI.

## Features

- Standardized Anthropic API interface
- Standardized OpenAI API interface
- Google Vertex Gemini integration
- OpenAI-compatible API integration
- TypeScript support

## API Interfaces

- `AnthropicMessageRequest` - Interface for Anthropic-compatible API requests
- `AnthropicMessageResponse` - Interface for Anthropic-compatible API responses
- `AnthropicModel` - Interface for implementing Anthropic-compatible models
- `OpenAIMessageRequest` - Interface for OpenAI-compatible API requests
- `OpenAIMessageResponse` - Interface for OpenAI-compatible API responses
- `OpenAIModel` - Interface for implementing OpenAI-compatible models

## Implementations

### Anthropic Models

- `VertexGeminiAnthropicModel` - Implementation mapping Anthropic API format to Google Vertex Gemini format.
  See [VertexGeminiAnthropicModel documentation](./docs/VertexGeminiAnthropicModel.md) for detailed usage instructions.
- `OpenAIAnthropicModel` - Implementation mapping Anthropic API format to OpenAI-compatible API format.
  See [OpenAIAnthropicModel documentation](./docs/OpenAIAnthropicModel.md) for detailed usage instructions.

### OpenAI Models

- `VertexGeminiOpenAIModel` - Implementation mapping OpenAI API format to Google Vertex Gemini format.
  See [VertexGeminiOpenAIModel documentation](./docs/VertexGeminiOpenAIModel.md) for detailed usage instructions.

For detailed specifications, see the [docs](./docs/) directory.