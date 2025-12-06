import { OpenAIModel } from "./OpenAIModel";

/**
 * Simple registry to centralize model registration
 *
 */
export class OpenAIModelRegistry {
    private registry: Map<string, OpenAIModel> = new Map<string, OpenAIModel>();

    /**
     * Registers a model in the registry
     * @param name - The name to register the model under
     * @param model - The OpenAIModel instance to register
     */
    register(name: string, model: OpenAIModel): void {
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
     * @returns The OpenAIModel instance if found, undefined otherwise
     */
    get(name: string): OpenAIModel | undefined {
        return this.registry.get(name);
    }
}
