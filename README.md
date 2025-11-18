# Chromagent

Chromagent is a Chrome extension development project that integrates with large language models (LLMs) like Google Gemini, OpenAI, Anthropic, and Google Vertex AI. It has evolved into an npm workspace to better manage its components, including a core library, a Chrome extension, a command-line interface (CLI) tool, and a gateway service.

## Features

*   **LLM Integration:** Connects to Google Gemini, OpenAI, Anthropic, and Google Vertex AI models via LangChain.js.
*   **Image Input:** Supports pasting images directly into the chat interface for multimodal interactions.
*   **Configurable Models:** Allows users to select between different model providers (Gemini, OpenAI, Anthropic, Vertex AI), and configure API keys, API base URLs, and model names.
*   **Persistent Configuration:** Saves user configurations (API keys, model choices) in browser local storage.
*   **Webpack & TypeScript:** Built with Webpack for bundling and TypeScript for type-safe development.

## Getting Started

### Prerequisites

*   Node.js (with npm)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/dungviettran89/chromagent.git
    cd chromagent
    ```
2.  Install dependencies and set up the workspace:
    ```bash
    npm install
    ```

### Development

To build all packages in the workspace:

```bash
npm run build
```

To start the development server for the extension in watch mode (auto-rebuild on code changes):

```bash
npm run dev --workspace=@chromagent/extension
```

### Loading the Extension in Chrome

1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable "Developer mode" (top right corner).
3.  Click "Load unpacked" and select the `packages/chromagent-extension/dist` directory from this project.
4.  The Chromagent extension should now appear in your extensions list and its icon will be visible in the browser toolbar.

## Usage

1.  Click the Chromagent extension icon in your browser toolbar to open the side panel.
2.  The side panel will display a chat interface. At the top, you'll see the currently selected model name and a settings (cog) icon.
3.  **Configuration:**
    *   Click the settings (cog) icon to switch to the configuration page.
    *   Select your desired "Model Type" (Gemini, OpenAI, Anthropic, or Vertex AI).
    *   Enter your "API Key" for the selected model.
    *   Optionally, enter an "API Base" URL if you are using a custom endpoint.
    *   Enter the "Model Name" (e.g., `gemini-2.5-flash` for Gemini, `gpt-3.5-turbo` for OpenAI, `claude-3-5-sonnet-20241022` for Anthropic, or `gemini-2.5-flash` for Vertex AI).
    *   Your settings will be automatically saved.
4.  **Chatting:**
    *   Click the settings (cog) icon again to return to the chat interface.
    *   Type your message in the input box.
    *   To send an image, copy an image to your clipboard and paste it directly into the input box. The image will appear in the chat history.
    *   Click "Send" to get a response from the configured LLM.

## CLI Usage

The Chromagent CLI provides command-line access to various models and services.

### List available models:
```bash
npx @chromagent/cli model list
```

### Chat with a model:
```bash
npx @chromagent/cli model chat <model> [prompt]
```

The chat command supports additional options:
*   `-p, --prompt`: Exit immediately after first response without waiting for the next prompt.
*   `-s, --system <prompt>`: System prompt to send to the model.

Example:
```bash
npx @chromagent/cli model chat opus -p "Hello" --system "You are a helpful assistant."
```

### Serve command:
Start an Anthropic-compatible API server:
```bash
npx @chromagent/cli serve -p 8080
```

This starts an Express server that exposes an Anthropic-compatible API at `/api/anthropic/v1/messages`.

## Project Structure

```
chromagent/
├───.github/              # GitHub Actions workflows
│   └───workflows/
│       └───build.yml     # Workflow for building the project
├───packages/
│   ├───chromagent-cli/   # Command-line interface tool (@chromagent/cli)
│   │   ├───src/
│   │   │   └───index.ts
│   │   └───package.json
│   │   └───tsconfig.json
│   ├───chromagent-core/  # Core logic and shared functionalities (@chromagent/core)
│   │   ├───src/
│   │   │   └───index.ts
│   │   └───package.json
│   │   └───tsconfig.json
│   ├───chromagent-extension/ # Chrome extension (@chromagent/extension)
│   │   ├───dist/         # Compiled extension files
│   │   ├───src/
│   │   │   ├───background.ts
│   │   │   ├───content_script.ts
│   │   │   ├───sidepanel.html
│   │   │   ├───sidepanel.ts
│   │   │   ├───manifest.json
│   │   │   └───service/
│   │       └───configService.ts
│   │   ├───package.json
│   │   ├───tsconfig.json
│   │   └───webpack.config.js
│   └───chromagent-gateway/ # Gateway service (@chromagent/gateway)
│       ├───dist/         # Compiled gateway files
│       ├───src/
│       │   └───(gateway source files)
│       ├───package.json
│       └───tsconfig.json
├───docs/                 # Documentation
│   ├───designs/          # Technical design documents
│   └───procedures/       # Common procedures
├───node_modules/         # Node.js dependencies
├───package.json          # Root workspace configuration
├───LICENSE
└───README.md
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
