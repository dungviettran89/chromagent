# Chromagent Core

This package provides the core logic for interacting with large language models (LLMs) and is designed to be extensible and reusable across different environments.

## Installation

```bash
npm install @chromagen/core
```

## Usage

### RoutingChatModel

The `RoutingChatModel` allows you to route requests between multiple LLM instances. It supports round-robin routing, failure handling with cooldowns, and fallback to a separate set of models.

Here is an example of how to use the `RoutingChatModel`:

```typescript
import { RoutingChatModel } from '@chromagen/core/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

// Define your main and fallback models
const mainModels = [
  new ChatOpenAI({ modelName: 'gpt-4' }),
  new ChatOpenAI({ modelName: 'gpt-3.5-turbo' }),
];

const fallbackModels = [
  new ChatOpenAI({ modelName: 'gpt-3.5-turbo' }),
];

// Create a new RoutingChatModel instance
const routingModel = new RoutingChatModel({
  mainModels,
  fallbackModels,
  failureCooldown: 30000, // 30 seconds
});

// Invoke the model with a message
const response = await routingModel.invoke([new HumanMessage('Hello, world!')]);

console.log(response.content);
```

In this example, the `RoutingChatModel` will first try to use the `gpt-4` model. If that model fails, it will try the `gpt-3.5-turbo` model. If both of those models fail, it will use the `gpt-3.5-turbo` model from the fallback list. If a model fails, it will be put on a 30-second cooldown before it is tried again.

### API Compatibility

Chromagent Core now supports multiple LLM providers through dedicated API modules:

#### OpenAI API
```typescript
import { createChatCompletions } from '@chromagen/core/openai';
```

#### Anthropic API
```typescript
import { AnthropicChatModel } from '@chromagen/core/anthropic';
```

#### Google Vertex AI API
```typescript
import { VertexChatModel } from '@chromagen/core/vertex';
```

### createChatCompletions

The `createChatCompletions` function creates an OpenAI-compatible chat completions endpoint using a provided LangChain `BaseChatModel`. This allows you to expose any LangChain chat model as an OpenAI-compatible API.

Here is an example of how to use the `createChatCompletions` function with Express:

```typescript
import express from 'express';
import { createChatCompletions } from '@chromagen/core/openai';
import { ChatOpenAI } from '@langchain/openai';

const app = express();
app.use(express.json());

const model = new ChatOpenAI({ modelName: 'gpt-3.5-turbo' });

app.post('/chat/completions', createChatCompletions(model));

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
```

This will create a `/chat/completions` endpoint that you can use with any OpenAI-compatible client. The endpoint supports both streaming and non-streaming responses, as well as multi-modal image inputs.