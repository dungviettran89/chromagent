# OpenAI Chat Completion API Specification

## Overview

The OpenAI Chat Completion API enables conversational interactions with OpenAI's language models (such as GPT-4, GPT-4o, GPT-3.5-turbo). The API supports multi-turn conversations, function/tool calling, vision capabilities, and streaming responses.

**Endpoint**: `POST https://api.openai.com/v1/chat/completions`

> [!NOTE]
> While the Chat Completions API is still supported, OpenAI now recommends using the newer "Responses API" for new projects to leverage the latest platform features.

## Authentication

All requests must include an API key in the Authorization header:

```
Authorization: Bearer YOUR_API_KEY
```

## Request Format

### Basic Structure

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

### Request Parameters

#### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | ID of the model to use (e.g., `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`) |
| `messages` | array | Array of message objects representing the conversation history |

#### Message Object Structure

Each message object requires:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | The role of the message author: `system`, `user`, `assistant`, or `tool` |
| `content` | string or array | The content of the message. Can be a string or an array for multimodal inputs (text + images) |
| `name` | string (optional) | Name of the author of the message |

#### Optional Parameters - Sampling Control

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `temperature` | number | 0-2 | 1 | Controls randomness. Higher values (0.8) make output more random, lower values (0.2) make it more focused and deterministic. Recommended to alter either this OR `top_p`, not both |
| `top_p` | number | 0-1 | 1 | Nucleus sampling - considers tokens whose cumulative probability adds up to this threshold. 0.1 means only top 10% probability mass tokens are considered. Recommended to alter either this OR `temperature`, not both |
| `max_tokens` | integer | - | varies | Maximum number of tokens to generate. Total length of input + output is limited by model's context length |
| `n` | integer | - | 1 | Number of chat completion choices to generate for each input. Generating multiple choices consumes more tokens |

#### Optional Parameters - Output Control

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `presence_penalty` | number | -2.0 to 2.0 | 0 | Positive values penalize tokens based on whether they appear in the text so far, encouraging new topics |
| `frequency_penalty` | number | -2.0 to 2.0 | 0 | Positive values penalize tokens based on their frequency in the text so far, decreasing likelihood of repetition |
| `stop` | string or array | - | null | Up to 4 sequences where the API will stop generating tokens. The stop sequence won't be included in the output (when stream=false) |
| `stream` | boolean | - | false | If true, partial message deltas will be sent as Server-Sent Events (SSE), similar to ChatGPT |

#### Optional Parameters - Advanced

| Parameter | Type | Description |
|-----------|------|-------------|
| `response_format` | object | Specifies output format. Use `{ "type": "json_object" }` to force JSON output |
| `seed` | integer | For deterministic sampling - same seed with same parameters should return same result |
| `logit_bias` | map | Modifies likelihood of specified tokens appearing in the completion |
| `logprobs` | boolean | Whether to return log probabilities of output tokens |
| `top_logprobs` | integer | 0-20, number of most likely tokens to return at each position (requires `logprobs: true`) |
| `user` | string | Unique identifier for end-user, helps OpenAI monitor and detect abuse |

#### Tools and Function Calling

| Parameter | Type | Description |
|-----------|------|-------------|
| `tools` | array | List of tools/functions the model may call |
| `tool_choice` | string or object | Controls which tool is called: `none`, `auto`, `required`, or specific tool |

**Tool Definition Example**:
```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather in a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name"
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

## Vision Capabilities

Multimodal models (GPT-4o, GPT-4 Turbo) can process images. Images can be provided as:

1. **Publicly accessible URL**
2. **Base64-encoded string**

The `content` field becomes an array containing text and image objects:

```json
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
        "detail": "high"
      }
    }
  ]
}
```

**Image Parameters**:
- `url`: Image URL or base64-encoded data URL (e.g., `data:image/jpeg;base64,...`)
- `detail`: `low`, `high`, or `auto` - controls processing level and token usage

**Limits**:
- Maximum 10 images per request
- `low` detail uses fewer tokens (faster, cheaper)
- `high` detail provides thorough analysis (more tokens)

## Response Format

### Standard Response (Non-Streaming)

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 9,
    "total_tokens": 19
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the chat completion |
| `object` | string | Object type, always `chat.completion` |
| `created` | integer | Unix timestamp of when the completion was created |
| `model` | string | The model used for completion |
| `choices` | array | Array of completion choices |
| `usage` | object | Token usage information |

#### Choice Object

| Field | Type | Description |
|-------|------|-------------|
| `index` | integer | Index of the choice in the array |
| `message` | object | The generated message |
| `finish_reason` | string | Why the model stopped: `stop`, `length`, `tool_calls`, `content_filter` |
| `logprobs` | object | Log probabilities (if requested) |

#### Usage Object

| Field | Type | Description |
|-------|------|-------------|
| `prompt_tokens` | integer | Number of tokens in the prompt |
| `completion_tokens` | integer | Number of tokens in the completion |
| `total_tokens` | integer | Total tokens used (prompt + completion) |

### Tool Call Response

When the model decides to call a tool:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"San Francisco\", \"unit\": \"celsius\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

After executing the tool, you must send the result back in a subsequent request:

```json
{
  "messages": [
    // ... previous messages
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [/* the tool call from previous response */]
    },
    {
      "role": "tool",
      "tool_call_id": "call_abc123",
      "content": "{\"temperature\": 22, \"condition\": \"sunny\"}"
    }
  ]
}
```

## Streaming Response

When `stream: true`, the response is sent as Server-Sent Events (SSE).

### Stream Event Format

Each event is a JSON chunk:

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### Stream Chunk Structure

| Field | Type | Description |
|-------|------|-------------|
| `object` | string | Always `chat.completion.chunk` for streaming |
| `delta` | object | Contains incremental content (instead of full `message`) |
| `delta.role` | string | Present in first chunk |
| `delta.content` | string | Incremental text fragment |
| `finish_reason` | string | Present in final chunk: `stop`, `length`, `tool_calls`, `content_filter` |

The stream ends with a `data: [DONE]` message.

## Error Responses

Errors return standard HTTP status codes with JSON body:

```json
{
  "error": {
    "message": "Invalid API key",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

### Common Error Codes

| Status | Type | Description |
|--------|------|-------------|
| 401 | `invalid_api_key` | Invalid authentication |
| 429 | `rate_limit_exceeded` | Rate limit or quota exceeded |
| 500 | `server_error` | OpenAI server error |
| 503 | `service_unavailable` | Service temporarily unavailable |

## Best Practices

1. **Temperature vs Top_p**: Alter only one at a time, not both
2. **Token Management**: Monitor usage and set `max_tokens` appropriately to control costs
3. **Function Calling**: Validate function arguments before execution
4. **Streaming**: Use streaming for better user experience in interactive applications
5. **Error Handling**: Implement exponential backoff for rate limit errors
6. **Image Detail**: Use `low` detail for general understanding to save tokens; use `high` for detailed analysis
7. **System Messages**: Use system role to set behavior and context for the assistant

## Example Requests

### Simple Chat

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'
```

### Vision Request

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "What is in this image?"},
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
  }'
```

### Streaming Request

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "stream": true
  }'
```

### Function/Tool Calling

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "What is the weather in Boston?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {"type": "string"}
            },
            "required": ["location"]
          }
        }
      }
    ]
  }'
```

## Supported Models

Common models (as of late 2024):
- `gpt-4o` - Latest multimodal flagship model
- `gpt-4o-mini` - Smaller, faster, cheaper version
- `gpt-4-turbo` - High-capability model with vision
- `gpt-4` - Previous generation flagship
- `gpt-3.5-turbo` - Fast and economical model

> [!IMPORTANT]
> Model availability and capabilities may change. Always refer to OpenAI's official documentation for the latest model information and deprecation notices.

## Rate Limits

Rate limits vary by:
- Organization tier
- Model used
- Request type (tokens per minute, requests per minute)

Monitor rate limit headers in responses:
- `x-ratelimit-limit-requests`
- `x-ratelimit-remaining-requests`
- `x-ratelimit-reset-requests`

Implement exponential backoff when receiving 429 errors.

## References

- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Chat Completions Guide](https://platform.openai.com/docs/guides/text-generation)
- [Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Vision Guide](https://platform.openai.com/docs/guides/vision)
