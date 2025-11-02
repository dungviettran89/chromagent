# VertexGeminiOpenAIModel

## Overview

The `VertexGeminiOpenAIModel` class provides a bridge between the OpenAI API format and Google Vertex AI's Gemini API
format. This allows applications using the OpenAI format to seamlessly work with Vertex Gemini models.

## Configuration

The model accepts the following configuration options:

- `apiKey`: API Key for authentication with Google Vertex AI
- `model`: The model name to use for all requests (e.g., "gemini-pro")
- `location`: The location/region for Google Vertex AI (optional)
- `project`: The project ID for Google Vertex AI (optional)

## Features

- Translates OpenAI API requests to Vertex Gemini format
- Supports image inputs (in base64 data URL format)
- Supports function calling (tools)
- Maps OpenAI parameters to equivalent Vertex parameters
- Transforms Vertex responses back to OpenAI format

## Usage

```typescript
import { VertexGeminiOpenAIModel } from 'chromagent-core';

const vertexModel = new VertexGeminiOpenAIModel({
  apiKey: 'your-api-key',
  model: 'gemini-pro'
});

const response = await vertexModel.message({
  model: 'my-model', // This is ignored, using configured model instead
  messages: [
    {
      role: 'user',
      content: 'Hello, how are you?'
    }
  ],
  max_tokens: 100
});
```