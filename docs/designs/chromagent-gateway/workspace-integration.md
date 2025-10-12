# Workspace Integration Design for Chromagent Gateway

## Overview

This document outlines the design for integrating the chromagent-gateway package into the existing chromagent workspace. The chromagent project is structured as an npm workspace with multiple packages, and the new gateway package needs to be properly integrated to work seamlessly with the existing ecosystem.

## Current Workspace Structure

The chromagent workspace currently consists of:

```
chromagent/
├── package.json (workspace root)
├── packages/
│   ├── chromagent-core/
│   ├── chromagent-extension/
│   └── chromagent-cli/
```

## Integration Plan

### 1. Package Structure

The new chromagent-gateway package will be added to the workspace:

```
chromagent/
├── package.json
├── packages/
│   ├── chromagent-core/
│   ├── chromagent-extension/
│   ├── chromagent-cli/
│   └── chromagent-gateway/  ← New package
```

### 2. Dependencies and Relationships

The chromagent-gateway package will have the following dependency relationships:

- **Depends on**: `chromagent-core` (for shared types and utilities)
- **Used by**: `chromagent-extension` (for backend connectivity), `chromagent-cli` (for testing)

## Package.json Configuration

### Root Workspace Configuration

The root `package.json` will be updated to include the new package:

```json
{
  "name": "chromagent",
  "private": true,
 "repository": {
    "type": "git",
    "url": "git+https://github.com/dungviettran89/chromagent.git"
  },
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm test --workspaces --if-present",
    "dev": "npm run dev --workspaces --if-present",
    "clean": "npm run clean --workspaces --if-present"
  }
}
```

### Gateway Package Configuration

The `packages/chromagent-gateway/package.json` will include:

```json
{
  "name": "chromagent-gateway",
  "version": "1.0.0",
  "description": "OpenAI-compatible gateway for multiple LLM backends",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "chromagent-gateway": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "clean": "rm -rf dist"
  },
  "keywords": [
    "llm",
    "gateway",
    "openai",
    "api",
    "vertex",
    "gemini",
    "anthropic"
  ],
  "author": "",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/dungviettran89/chromagent.git",
    "directory": "packages/chromagent-gateway"
  },
  "dependencies": {
    "chromagent-core": "^1.0.0",
    "express": "^4.18.2",
    "@types/express": "^4.17.17",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "express-rate-limit": "^7.0.0",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/jest": "^29.5.0",
    "@types/cors": "^2.8.13",
    "typescript": "^5.0.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.1",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0"
  }
}
```

## Integration with chromagent-core

### Shared Types

The gateway will use types from `chromagent-core` for consistency:

```typescript
// Import shared types
import { 
  OpenAIChatCompletionCreateParams,
  OpenAIChatCompletionResponse,
  OpenAIChatCompletionStreamResponse,
  // Other OpenAI-compatible types
} from 'chromagent-core';

// Backend-specific types
import {
  VertexGeminiRequest,
  VertexGeminiResponse,
  AnthropicMessageCreateParams,
  AnthropicMessageResponse,
  // Other backend types
} from 'chromagent-core';
```

### Utility Functions

The gateway may reuse utility functions from `chromagent-core`:

```typescript
// Example of using core utilities
import { validateApiKey } from 'chromagent-core/utils';
import { TokenCounter } from 'chromagent-core/tokenization';
```

## Integration with chromagent-extension

### Backend Connectivity

The chromagent-extension will be updated to optionally use the local gateway instead of direct API calls:

```typescript
// In chromagent-extension/src/service/modelProvider.ts
interface ModelProviderConfig {
  type: 'direct' | 'gateway'; // New option
  gatewayUrl?: string; // URL for gateway when type is 'gateway'
  // existing direct API config fields
}

class ModelProvider {
  private config: ModelProviderConfig;
  
  async getCompletion(messages: any[]) {
    if (this.config.type === 'gateway') {
      // Route through local gateway
      const response = await fetch(`${this.config.gatewayUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages
        })
      });
      return response.json();
    } else {
      // Use existing direct connection logic
    }
  }
}
```

### Configuration Updates

The extension's configuration service will support gateway settings:

```typescript
// In chromagent-extension/src/service/configService.ts
interface ExtensionConfig {
  // existing config fields
  gateway: {
    enabled: boolean;
    url: string;
    defaultBackend: string;
  };
}
```

## Integration with chromagent-cli

### CLI Commands

The CLI will include commands to interact with the gateway:

```typescript
// In chromagent-cli/src/index.ts
import { GatewayClient } from 'chromagent-gateway';

// New command to start a local gateway
program
  .command('gateway')
  .description('Start a local OpenAI-compatible gateway')
  .option('-p, --port <port>', 'Port to run the gateway on', '3000')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(async (options) => {
    const config = loadConfig(options.config);
    const server = new GatewayServer({
      ...config,
      port: parseInt(options.port)
    });
    
    await server.start();
    console.log(`Gateway running on port ${options.port}`);
 });

// Command to test the gateway
program
  .command('gateway:test')
  .description('Test the gateway connection')
  .option('-u, --url <url>', 'Gateway URL to test', 'http://localhost:3000')
  .action(async (options) => {
    const client = new GatewayClient({ baseUrl: options.url });
    
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      });
      
      console.log('Gateway test successful:', response.choices[0].message.content);
    } catch (error) {
      console.error('Gateway test failed:', error);
    }
 });
```

## Build and Development Workflow

### Build Process

The build process will be unified across all packages:

```json
// Root package.json scripts
{
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "build:gateway": "npm run build --workspace=chromagent-gateway",
    "dev": "concurrently \"npm run dev --workspace=chromagent-core\" \"npm run dev --workspace=chromagent-gateway\""
  }
}
```

### Development Commands

```bash
# Build all packages
npm run build

# Build only the gateway
npm run build:gateway

# Start development with watching
npm run dev

# Run tests across all packages
npm test

# Run only gateway tests
npm test --workspace=chromagent-gateway
```

## Testing Integration

### Cross-Package Testing

The test suite will include integration tests between packages:

```typescript
// packages/chromagent-gateway/test/integration/core.test.ts
import { OpenAIChatCompletionCreateParams } from 'chromagent-core';
import { GatewayServer } from '../src/server';

describe('Gateway Integration with Core', () => {
  it('should use core types correctly', () => {
    const request: OpenAIChatCompletionCreateParams = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    };
    
    expect(request).toHaveProperty('model');
    expect(request).toHaveProperty('messages');
  });
});

// packages/chromagent-gateway/test/integration/cli.test.ts
import { spawn } from 'child_process';

describe('Gateway Integration with CLI', () => {
  it('should be callable from CLI', (done) => {
    const cli = spawn('npx', ['chromagent-gateway', '--help']);
    
    cli.stdout.on('data', (data) => {
      expect(data.toString()).toContain('Start a local OpenAI-compatible gateway');
      done();
    });
    
    cli.on('error', done);
  });
});
```

## Deployment and Distribution

### NPM Publishing

The package will be published to npm with proper versioning:

```json
// npm publish scripts
{
  "scripts": {
    "prepublishOnly": "npm run build",
    "version": "npm run build && git add -A dist",
    "postversion": "git push && git push --tags"
  }
}
```

### Version Synchronization

The gateway package will follow semantic versioning and maintain compatibility with other chromagent packages:

```json
// In packages/chromagent-gateway/package.json
{
  "dependencies": {
    "chromagent-core": "^1.0.0"  // Version range that ensures compatibility
  }
}
```

## Documentation Integration

### README Updates

The main README.md will be updated to include information about the new gateway package:

```markdown
## Packages

- **chromagent-core**: Core functionality and shared utilities
- **chromagent-extension**: Chrome extension for browser interaction
- **chromagent-cli**: Command-line interface for testing and utilities
- **chromagent-gateway**: OpenAI-compatible gateway for multiple LLM backends
```

### Design Documentation

All the design documents created for the gateway will be properly organized in the docs/designs directory:

```
docs/designs/
├── chromagent-core/
├── chromagent-extension/
├── chromagent-gateway/
│   ├── README.md
│   ├── types.md
│   ├── server.md
│   ├── transformation.md
│   ├── streaming.md
│   ├── tool-calls.md
│   ├── image-inputs.md
│   ├── token-usage.md
│   ├── vertex-gemini-converter.md
│   ├── vertex-anthropic-converter.md
│   ├── custom-backends.md
│   ├── testing.md
│   ├── usage.md
│   └── workspace-integration.md
```

## Migration Path

### For Existing Users

The integration will be backward compatible, and existing functionality will remain unchanged. New users can optionally use the gateway for additional backend support.

### Configuration Migration

If users want to switch to using the gateway, they can update their configuration:

```typescript
// Old configuration (direct API)
const config = {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY
};

// New configuration (with gateway)
const config = {
  provider: 'gateway',
  gatewayUrl: 'http://localhost:3000',
  gatewayBackends: {
    openai: process.env.OPENAI_API_KEY,
    vertex: process.env.VERTEX_API_KEY
  }
};
```

This integration design ensures that the chromagent-gateway package fits seamlessly into the existing workspace while maintaining compatibility and providing enhanced functionality for users who want to leverage multiple LLM backends through a single OpenAI-compatible interface.