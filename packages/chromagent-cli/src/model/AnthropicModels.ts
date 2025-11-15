import {AnthropicModelRegistry} from "@chromagent/core";

/**
 * Automatically register models based on environment variable
 */
export class AnthropicModels {
    private modelRegistry: AnthropicModelRegistry;

    constructor() {
        this.modelRegistry = new AnthropicModelRegistry();
    }

    register() {
        let index = 1;
    }
}