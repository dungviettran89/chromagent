import { GatewayServer } from '../src/server';
import { GatewayConfig, BackendConfig } from '../src/types';

describe('GatewayServer', () => {
  let server: GatewayServer;
  let config: GatewayConfig;

  beforeEach(() => {
    const backends: BackendConfig[] = [
      {
        id: 'test-gemini',
        type: 'vertex-gemini',
        apiKey: 'test-key',
        enabled: false, // Disabled for test purposes
      },
      {
        id: 'test-anthropic',
        type: 'vertex-anthropic',
        apiKey: 'test-key',
        enabled: false, // Disabled for test purposes
      }
    ];

    config = {
      port: 0, // Use port 0 to let the OS select an available port
      defaultBackend: 'test-gemini',
      backends,
      timeout: 30000
    };
  });

  it('should initialize without throwing an error', () => {
    expect(() => {
      server = new GatewayServer(config);
    }).not.toThrow();
  });

  it('should have the correct configuration', () => {
    server = new GatewayServer(config);
    
    expect(server).toBeDefined();
    // Additional assertions can be made here based on the server's public API
  });
});