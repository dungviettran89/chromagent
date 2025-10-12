import { BackendProvider, BackendConfig } from '../types';

export interface BackendRegistry {
  // Register a new backend type
  registerBackend(type: string, backendClass: new () => BackendProvider): void;
  
  // Create an instance of a backend
  createBackend(type: string): BackendProvider | null;
  
  // Get a backend instance by type
  getBackend(type: string): BackendProvider | null;
  
  // List all registered backend types
  listBackendTypes(): string[];
}

export class DefaultBackendRegistry implements BackendRegistry {
  private backends: Map<string, new () => BackendProvider> = new Map();
  private instances: Map<string, BackendProvider> = new Map();
  
  constructor() {
    // Register built-in backends
    // These will be imported and registered once the backend files are created
  }
  
  // Register a new backend type
  registerBackend(type: string, backendClass: new () => BackendProvider): void {
    this.backends.set(type, backendClass);
  }
  
  // Create an instance of a backend
  createBackend(type: string): BackendProvider | null {
    const BackendClass = this.backends.get(type);
    if (!BackendClass) {
      return null;
    }
    
    return new BackendClass();
  }
  
  // Get a backend instance by type
  getBackend(type: string): BackendProvider | null {
    if (!this.instances.has(type)) {
      const backend = this.createBackend(type);
      if (backend) {
        this.instances.set(type, backend);
      }
    }
    
    return this.instances.get(type) || null;
  }
  
  // List all registered backend types
  listBackendTypes(): string[] {
    return Array.from(this.backends.keys());
  }
  
  // API for users to register custom backends
  registerCustomBackend(type: string, backendClass: new () => BackendProvider): void {
    if (this.backends.has(type)) {
      throw new Error(`Backend type '${type}' is already registered`);
    }
    
    this.registerBackend(type, backendClass);
  }
}