// Gateway-specific types
import { OpenAIChatCompletionCreateParams, BackendConfig } from './index';

export interface GatewayConfig {
  // Default backend provider
  defaultBackend: string;
  
  // Backend provider configurations
  backends: BackendConfig[];
  
  // Port for the gateway server
  port: number;
  
  // CORS settings
  cors?: {
    origin: string | string[];
    credentials: boolean;
  };
  
  // Rate limiting settings
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  
  // Timeout settings
  timeout: number;
  
  // Routing rules for directing requests to specific backends
  routingRules?: Array<{
    condition: string; // e.g., "model: gpt-4", "has_tools: true", etc.
    backendId: string;
  }>;
}

export interface GatewayBackendConfig {
  // Default backend to use when no specific routing rules apply
  defaultBackend: string;
  
  // Configuration for all available backends
  backends: BackendConfig[];
  
  // Routing rules for directing requests to specific backends
  routingRules?: Array<{
    condition: string; // e.g., "model: gpt-4", "has_tools: true", etc.
    backendId: string;
  }>;
}

export interface RequestRouterResult {
  backend: string;
  config: BackendConfig;
}