# Chromagent

Chromagent is a Chrome extension development project that integrates with large language models (LLMs) like Google Gemini and OpenAI. It provides a side panel chat interface where users can interact with these models, including the ability to send text and image inputs.

## Features

*   **LLM Integration:** Connects to Google Gemini and OpenAI models via LangChain.js.
*   **Image Input:** Supports pasting images directly into the chat interface for multimodal interactions.
*   **Configurable Models:** Allows users to select between Gemini and OpenAI, and configure API keys, API base URLs, and model names.
*   **Persistent Configuration:** Saves user configurations (API keys, model choices) in browser local storage.
*   **Webpack & TypeScript:** Built with Webpack for bundling and TypeScript for type-safe development.

## Getting Started

### Prerequisites

*   Node.js (with npm)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd chromagent
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Development

To start the development server in watch mode (auto-rebuild on code changes):

```bash
npm run dev
```

To build the extension for production:

```bash
npm run build
```

### Loading the Extension in Chrome

1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable "Developer mode" (top right corner).
3.  Click "Load unpacked" and select the `dist` directory from this project.
4.  The Chromagent extension should now appear in your extensions list and its icon will be visible in the browser toolbar.

## Usage

1.  Click the Chromagent extension icon in your browser toolbar to open the side panel.
2.  The side panel will display a chat interface. At the top, you'll see the currently selected model name and a settings (cog) icon.
3.  **Configuration:**
    *   Click the settings (cog) icon to switch to the configuration page.
    *   Select your desired "Model Type" (Gemini or OpenAI).
    *   Enter your "API Key" for the selected model.
    *   Optionally, enter an "API Base" URL if you are using a custom endpoint.
    *   Enter the "Model Name" (e.g., `gemini-2.5-flash` for Gemini, `gpt-3.5-turbo` for OpenAI).
    *   Your settings will be automatically saved.
4.  **Chatting:**
    *   Click the settings (cog) icon again to return to the chat interface.
    *   Type your message in the input box.
    *   To send an image, copy an image to your clipboard and paste it directly into the input box. The image will appear in the chat history.
    *   Click "Send" to get a response from the configured LLM.

## Project Structure

```
chromagent/
├───dist/                 # Compiled extension files
├───node_modules/         # Node.js dependencies
├───src/
│   ├───background.ts     # Background service worker script
│   ├───content_script.ts # Content script (if any)
│   ├───sidepanel.html    # HTML for the side panel UI
│   ├───sidepanel.ts      # TypeScript logic for the side panel
│   ├───manifest.json     # Chrome extension manifest
│   └───service/
│       └───configService.ts # Service for managing configurations
├───docs/
│   └───design.md         # High-level design document
├───package.json
├───tsconfig.json
├───webpack.config.js
└───README.md
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is licensed under the [ISC License](LICENSE).