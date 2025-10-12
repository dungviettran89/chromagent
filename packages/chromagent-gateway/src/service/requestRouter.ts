import { OpenAIChatCompletionCreateParams, BackendConfig, RequestRouterResult } from '../types';
import { BackendRegistry } from '../backends/registry';

export class RequestRouter {
  private registry: BackendRegistry;
  private configs: Map<string, BackendConfig>;

  constructor(registry: BackendRegistry, configs: BackendConfig[]) {
    this.registry = registry;
    this.configs = new Map();
    
    // Initialize configs
    for (const config of configs) {
      this.configs.set(config.id, config);
    }
  }

  // Determine which backend to use for a request
  determineBackend(request: OpenAIChatCompletionCreateParams): RequestRouterResult | null {
    // Find all backends that can handle the requested model
    const suitableBackends: Array<{ backendId: string; config: BackendConfig }> = [];
    
    // First, check for backends with explicit model mapping
    for (const [configId, config] of this.configs) {
      if (!config.enabled) continue;
      
      // Check if this backend explicitly supports the requested model
      if (config.modelMapping && request.model in config.modelMapping) {
        // Check if request requires specific features
        const requiresTools = !!(request.tools || request.tool_choice);
        const requiresImages = this.requestRequiresImages(request);
        
        if (requiresTools && !config.enabled) continue; // This is a simplified check, actual check would be per backend
        if (requiresImages && !config.enabled) continue; // This is a simplified check, actual check would be per backend
        
        suitableBackends.push({ backendId: configId, config: this.configs.get(configId)! });
      }
    }
    
    // If no explicitly mapped backends found, check for backends that might support the model generally
    if (suitableBackends.length === 0) {
      for (const [configId, config] of this.configs) {
        if (!config.enabled) continue;
        
        // Check if request requires specific features
        const requiresTools = !!(request.tools || request.tool_choice);
        const requiresImages = this.requestRequiresImages(request);
        
        if (requiresTools && !config.enabled) continue; // This is a simplified check, actual check would be per backend
        if (requiresImages && !config.enabled) continue; // This is a simplified check, actual check would be per backend
        
        suitableBackends.push({ backendId: configId, config: this.configs.get(configId)! });
      }
    }
    
    // If still no suitable backends, try default
    if (suitableBackends.length === 0) {
      const defaultConfig = Array.from(this.configs.values()).find(c => c.id === 'default' && c.enabled);
      if (defaultConfig) {
        return { backend: 'default', config: defaultConfig };
      }
      
      // If no suitable backend found, return null
      return null;
    }
    
    // Implement round-robin selection among suitable backends
    const selectedBackend = this.roundRobinSelect(suitableBackends, request.model);
    return { backend: selectedBackend.backendId, config: selectedBackend.config };
  }

  // Add the missing getBackend method
  getBackend(type: string) {
    return this.registry.getBackend(type);
  }

  private roundRobinIndex: Map<string, number> = new Map(); // Per-model round-robin tracking

  private roundRobinSelect(
    backends: Array<{ backendId: string; config: BackendConfig }>,
    model: string
  ): { backendId: string; config: BackendConfig } {
    const currentIndex = this.roundRobinIndex.get(model) || 0;
    const selected = backends[currentIndex % backends.length];
    
    // Update the index for next request for this model
    this.roundRobinIndex.set(model, currentIndex + 1);
    
    return selected;
  }

  private requestRequiresImages(request: OpenAIChatCompletionCreateParams): boolean {
    for (const message of request.messages) {
      if (typeof message.content !== 'string' && Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'image_url') {
            return true;
          }
        }
      }
    }
    return false;
  }
}