// Main entry point for the Chromagent Gateway package
export { GatewayServer } from './server';
export { RequestRouter } from './service/requestRouter';
export { DefaultBackendRegistry } from './backends/registry';
export * from './types';
export * from './utils/transformer';
export * from './utils/token';
export * from './utils/stream';
export * from './utils/image';
export * from './utils/tools';
export * from './backends/base';
export * from './backends/vertex-gemini';
export * from './backends/vertex-anthropic';
export * from './backends/ollama';

// CLI entry point would be in a separate file if needed
// For now, the main server functionality is exported above