# High-Level Design: Chromagent

## 1. Introduction
Chromagent is a Chrome extension designed to provide a seamless chat interface for interacting with large language models (LLMs) such as Google Gemini and OpenAI. It emphasizes ease of use, configurability, and multimodal input capabilities (text and images).

## 2. Architecture Overview
The extension follows a standard Chrome extension architecture, primarily utilizing a side panel for the user interface and a background service worker for handling API interactions and persistent storage.

### Key Components:
*   **Side Panel (sidepanel.html, sidepanel.ts):** This is the primary user interface where users can chat with LLMs, configure settings, and view responses. It's built with vanilla HTML and TypeScript for dynamic behavior. The UI's role is primarily to display the current state of the chat history database.
*   **Background Service Worker (background.ts):** This script runs in the background and is the central hub for all LLM API interactions. It handles:
    *   All LLM API requests (via LangChain.js).
    *   Inter-component communication (e.g., between side panel and content script, if any).
    *   Management of persistent data (e.g., user configurations) using Chrome's `chrome.storage.local` API.
    *   Management of chat history using `lowdb`.
*   **Content Script (content_script.ts - currently minimal/placeholder):** While not heavily utilized in the current version, this component would typically interact with the content of web pages. Its role is minimal in the current chat-focused design.
*   **Configuration Service (service/configService.ts):** A dedicated service responsible for managing and persisting user settings such as API keys, model types (Gemini/OpenAI), API base URLs, and model names. It abstracts the direct interaction with `chrome.storage.local`.
*   **Model Provider (e.g., `service/modelProvider.ts`):** This module is responsible for providing the configured chat model instances (e.g., Gemini, OpenAI) to the background service worker, abstracting the LLM initialization logic.
*   **Chat History Database (lowdb):** `lowdb` is used within the background service worker to store the chat history as a simple, file-based JSON database. This acts as the single source of truth for chat data.
*   **Manifest File (manifest.json):** Defines the extension's properties, permissions, entry points (side panel, background script), and other metadata required by Chrome.

## 3. Data Flow
1.  **User Input:** The user types a message or pastes an image into the side panel's chat interface.
2.  **Side Panel Processing:** The `sidepanel.ts` script captures the input, potentially processes image data (e.g., converting to base64 for API transmission). It then sends this message to the background service worker using Chrome's `chrome.runtime.sendMessage` API.
3.  **Background Service Worker (LLM Interaction & History Management):**
    *   Receives the message from the side panel via a `chrome.runtime.onMessage` listener.
    *   Retrieves the current LLM configuration (API key, model type, etc.) from `configService`.
    *   Utilizes the Model Provider to get the appropriate LLM instance.
    *   Uses LangChain.js to construct and send the appropriate request to the selected LLM (Gemini or OpenAI).
    *   Handles the LLM's response.
    *   Updates the chat history in `lowdb` with both the user's message and the LLM's response.
4.  **Response to Side Panel:** The background service worker sends the LLM's response (and potentially updates to the chat history) back to the side panel, typically via `chrome.tabs.sendMessage` or by notifying the side panel to re-query the chat history.
5.  **Side Panel Display:** The `sidepanel.ts` script receives the response or queries the `lowdb` state (via the background worker) and updates the chat interface to display the LLM's output, reflecting the current state of the chat history database.

## 4. Configuration Management
User configurations (API keys, model choices, etc.) are stored persistently using Chrome's `chrome.storage.local` API. The `configService.ts` module provides a clean interface for setting and retrieving these configurations, ensuring they persist across browser sessions.

## 5. Build Process
The project uses Webpack for bundling and TypeScript for type safety.
*   `webpack.config.js`: Configures how TypeScript files are compiled and bundled into the `dist` directory, which contains the deployable extension.
*   `npm run dev`: Starts Webpack in watch mode for development, automatically rebuilding on code changes.
*   `npm run build`: Creates a production-ready build of the extension.

## 6. Tool and Resource Integration
To enhance the LLM's capabilities, the extension provides specific tools and resources:

### Tools
*   **Navigate Tool:** This tool allows the LLM to instruct the extension to open a new browser tab with a specified URL. This is implemented by the background service worker using Chrome's `chrome.tabs.create` API.

### Resources
*   **Tab Resource:** This resource provides the LLM with a list of all currently opened browser tabs, including their URLs and titles. The background service worker retrieves this information using Chrome's `chrome.tabs.query` API and exposes it to the LLM as context.

## 7. Future Considerations
*   Enhanced content script integration for context-aware interactions.
*   More sophisticated error handling and user feedback mechanisms.
*   Support for additional LLM providers or custom endpoints.
*   Improved UI/UX for chat history and settings.
