# Chromagent Core Design

## 1. Introduction

`chromagent-core` is a foundational package for the Chromagent project. It provides the core logic for interacting with large language models (LLMs) and is designed to be extensible and reusable across different environments.

## 2. Architecture

The package is built with TypeScript and leverages the LangChain.js library for its core LLM interaction capabilities. It is designed to be a modular and extensible component of the larger Chromagent ecosystem.

### Key Components:

*   **`RoutingChatModel`:** This is a custom LangChain `BaseChatModel` implementation that provides robust and configurable routing between multiple LLM instances. It supports round-robin routing, failure handling with cooldowns, and fallback to a separate set of models.
*   **OpenAI Integration:** The package includes a module for creating chat completions with the OpenAI API. This module is responsible for handling the specifics of the OpenAI API, including multi-modal inputs.

## 3. Design Principles

`chromagent-core` provides utilities and building blocks around `langchain` and `langgraph`. The primary goal is to empower other packages and tools to compose any agent they may need. 

- **Focus on Utilities:** The package will only provide base classes or utility methods (e.g., `RoutingChatModel`) to configure existing servers or add functionality to models.
- **No Orchestration:** This package will not perform any high-level orchestration or agentic logic. It provides the tools, but the implementation of the agent itself is left to the consumer of this package.

## 4. Technology Stack

*   **Language:** TypeScript
*   **Core LLM Framework:** LangChain.js
*   **LLM Providers:**
    *   OpenAI
    *   Google Gemini
*   **Testing:**
    *   Mocha
    *   Chai
    *   Sinon
*   **Build Tool:** `tsc` (TypeScript Compiler)

## 5. Key Features

*   **Model Routing:** The `RoutingChatModel` allows for sophisticated routing between different LLM instances, providing flexibility and resilience.
*   **Multi-Modal Support:** The OpenAI integration supports multi-modal inputs, allowing for the use of images in chat completions.
*   **Extensibility:** The package is designed to be extensible, allowing for the addition of new LLM providers and custom routing logic.

## 6. Future Considerations

*   **Additional LLM Providers:** The package could be extended to support other LLM providers, such as Anthropic's Claude.
*   **More Sophisticated Routing:** The routing logic could be enhanced to support more complex routing strategies, such as routing based on model capabilities or cost.