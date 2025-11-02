# OpenAI Model Interfaces

## Overview

The OpenAI model interfaces provide standardized ways to interact with OpenAI-compatible APIs. This includes interfaces
for requests and responses that mirror the OpenAI Chat Completions API.

## Interfaces

### OpenAIMessageRequest

The `OpenAIMessageRequest` interface defines the structure for making requests to an OpenAI-compatible API. It includes:

- `model`: The model to use for the request
- `messages`: Array of messages in the conversation
- `temperature`: Sampling temperature (0-2)
- `max_tokens`: Maximum number of tokens to generate
- `tools`: Function definitions for tool use
- `tool_choice`: How to handle tool usage
- Various other OpenAI-compatible parameters

### OpenAIMessageResponse

The `OpenAIMessageResponse` interface defines the structure of responses from OpenAI-compatible APIs. It includes:

- `id`: Unique identifier for the completion
- `choices`: Array of possible completions
- `model`: The model used for the completion
- `usage`: Token usage statistics
- Various other OpenAI-compatible fields

### OpenAIModel

The `OpenAIModel` interface defines the contract for implementing OpenAI-compatible models, with a single `message`
method.