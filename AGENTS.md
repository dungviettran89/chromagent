# Chromagent Project Context

## Project Overview
Chromagent is a Chrome extension development project that integrates with large language models (LLMs) like Google Gemini and OpenAI. It has evolved into an npm workspace to better manage its components, including a core library, a Chrome extension, and a command-line interface (CLI) tool.

The project enables agentic browser functionality by connecting to LLMs through LangChain.js, supporting multimodal interactions with image input capabilities, and providing configurable model settings with persistent configuration storage.

## Architecture
The project follows an npm workspace structure with three main packages:

1. **chromagent-core** (`packages/chromagent-core`): Core logic and shared functionalities
   - Dependencies: @langchain/community, @langchain/core, @langchain/google-genai, @langchain/openai, @google/generative-ai, @anthropic-ai/sdk, openai, langchain, express
   - Contains shared logic for LLM integration using LangChain.js

2. **chromagent-extension** (`packages/chromagent-extension`): Chrome extension implementation
   - Dependencies: LangChain libraries for LLM integration
   - Uses Webpack for bundling and TypeScript for development
   - Provides browser UI with side panel chat interface

3. **chromagent-cli** (`packages/chromagent-cli`): Command-line interface tool
   - Depends on chromagent-core for functionality

## Key Technologies
- **LangChain.js**: Provides the interface to various LLMs (Google Gemini, OpenAI)
- **TypeScript**: For type-safe development
- **Webpack**: For module bundling
- **npm workspaces**: For monorepo management

## Common Dependencies

- **@langchain/community**: Community tools and integrations for LangChain
- **@langchain/core**: Core LangChain functionality
- **@langchain/google-genai**: Google Generative AI integration for LangChain
- **@langchain/openai**: OpenAI integration for LangChain
- **@google/generative-ai**: Google's Generative AI SDK
- **@anthropic-ai/sdk**: Anthropic AI SDK
- **openai**: OpenAI API SDK
- **langchain**: Main LangChain.js library
- **express**: Web server framework
- **chai**: Testing assertion library
- **sinon**: Testing spies, stubs, and mocks
- **ts-mocha**: TypeScript test runner
- **jest**: JavaScript testing framework
- **typescript**: Type checking for JavaScript
- **webpack**: Module bundler
- **node-fetch**: Fetch API implementation for Node.js

## Building and Running

### Prerequisites
- Node.js (with npm)

### Installation
```bash
npm install
```

### Development Commands
- Build all packages: `npm run build`
- Run tests: `npm test` (runs across all workspaces)
- Extension development server: `npm run dev --workspace=chromagent-extension`

### Loading the Extension in Chrome
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `packages/chromagent-extension/dist`

## Key Features
- LLM Integration: Connects to Google Gemini and OpenAI models
- Image Input: Supports pasting images directly into the chat interface
- Configurable Models: Allows selection between Gemini and OpenAI
- Persistent Configuration: Saves user configurations in browser local storage

## Development Conventions
- Code is written in TypeScript
- Uses LangChain.js for LLM integrations
- Follows npm workspace conventions
- Uses Webpack for bundling the extension
- When running build or test commands, use `npm run build` and `npm run test` rather than npx commands to ensure
  consistency across the workspace

## Special Tools
- `qwen.sh`: Script to run Qwen Code agent for this project
- `gemini.sh`: Script to run Google Gemini agent for this project

## Project Structure
```
chromagent/
├───.github/              # GitHub Actions workflows
│   └───workflows/
│       └───build.yml     # Workflow for building the project
├───packages/
│   ├───chromagent-cli/   # Command-line interface tool
│   │   ├───src/
│   │   │   └───index.ts
│   │   └───package.json
│   │   └───tsconfig.json
│   ├───chromagent-core/  # Core logic and shared functionalities
│   │   ├───src/
│   │   │   └───index.ts
│   │   └───package.json
│   │   └───tsconfig.json
│   └───chromagent-extension/ # Chrome extension
│       ├───dist/         # Compiled extension files
│       ├───src/
│       │   ├───background.ts
│       │   ├───content_script.ts
│       │   ├───sidepanel.html
│       │   ├───sidepanel.ts
│       │   ├───manifest.json
│       │   └───service/
│       │       └───configService.ts
│       ├───package.json
│       ├───tsconfig.json
│       └───webpack.config.js
├───node_modules/         # Node.js dependencies
├───docs/                 # Documentation
│   ├───designs/          # Technical design documents
│   ├───plans/            # Implementation plans
│   └───procedures/       # Common procedures
├───package.json          # Root workspace configuration
├───LICENSE
└───README.md
```

## Documentation Policy
All agents must document their activities in the logs folder using the following format:
- File name: `YYYY-MM-DD-HHMM-description.md` (timestamp followed by a brief description)
- Content: A markdown document describing what was done, including:
  - Date of the activity
  - Summary of tasks completed
  - Services affected
  - Configuration files modified
  - Any important notes or observations

## Script Policy
If agents need to write temporary scripts, please write and put them into temp folder. Only Nodejs and bash script can be written and triggered.

## Files of Interest
- `README.md`: Project overview and setup instructions
- `package.json`: Root workspace configuration
- `packages/chromagent-core/package.json`: Core package dependencies and scripts
- `packages/chromagent-extension/package.json`: Extension package dependencies and scripts
- `qwen.sh` and `gemini.sh`: Scripts for running agent tools
- All files in `docs/` directory for design documents, procedures, and plans