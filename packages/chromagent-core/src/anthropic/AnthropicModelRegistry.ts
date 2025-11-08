import {AnthropicModel} from "./AnthropicModel";

/**
 * Simple registry to centralize model registration
 *
 */
export class AnthropicModelRegistry {
    private registry: Map<string, AnthropicModel> = new Map<string, AnthropicModel>();

    /**
     * Registers a model in the registry
     * @param name - The name to register the model under
     * @param model - The AnthropicModel instance to register
     */
    register(name: string, model: AnthropicModel): void {
        this.registry.set(name, model);
    }

    /**
     * Unregisters a model from the registry
     * @param name - The name of the model to unregister
     * @returns true if the model existed and was removed, false otherwise
     */
    unregister(name: string): boolean {
        return this.registry.delete(name);
    }

    /**
     * Checks if a model exists in the registry
     * @param name - The name of the model to check
     * @returns true if the model exists, false otherwise
     */
    has(name: string): boolean {
        return this.registry.has(name);
    }

    /**
     * Lists all model names in the registry
     * @returns An array of all registered model names
     */
    list(): string[] {
        return Array.from(this.registry.keys());
    }

    /**
     * Gets a registered model by name
     * @param name - The name of the model to retrieve
     * @returns The AnthropicModel instance if found, undefined otherwise
     */
    get(name: string): AnthropicModel | undefined {
        return this.registry.get(name);
    }
}