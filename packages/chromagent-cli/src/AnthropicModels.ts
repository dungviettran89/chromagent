import {
    AnthropicModelRegistry,
    LoadBalancedAnthropicModel,
    ModelWithWeight,
    VertexGeminiAnthropicModel
} from "@chromagent/core";

/**
 * The AnthropicModels class is responsible for automatically registering and configuring
 * various Anthropic models based on environment variables. It reads API keys and model names
 * from the environment, then registers them with the AnthropicModelRegistry.
 *
 * This class supports registering multiple types of models, including Vertex Gemini models,
 * and sets up load balancing for different model categories such as 'opus', 'claude', and 'haiku'.
 *
 * The registration process is driven by the following environment variables:
 * - VERTEX_GEMINI_API_KEY: A comma-separated list of API keys for Vertex Gemini.
 * - VERTEX_GEMINI_OPUS_MODEL: A comma-separated list of Opus model names.
 * - VERTEX_GEMINI_CLAUDE_MODEL: A comma-separated list of Claude model names.
 * - VERTEX_GEMINI_HAIKU_MODEL: A comma-separated list of Haiku model names.
 *
 * Once the models are registered, they can be accessed through the AnthropicModelRegistry.
 * This class also creates load-balanced models for each category, allowing for resilient
 * and scalable model usage.
 */
export class AnthropicModels {
    public readonly modelRegistry: AnthropicModelRegistry;

    constructor() {
        this.modelRegistry = new AnthropicModelRegistry();
    }

    async registerGeminiModels() {
        const apiKeys: string[] = process.env.VERTEX_GEMINI_API_KEY?.split(',').map(key => key?.trim()).filter(Boolean) || [];
        const opusModels: string[] = process.env.VERTEX_GEMINI_OPUS_MODEL?.split(',').map(key => key?.trim()).filter(Boolean) || ["gemini-2.5-flash", "gemini-flash-latest"];
        const claudeModels: string[] = process.env.VERTEX_GEMINI_CLAUDE_MODEL?.split(',').map(key => key?.trim()).filter(Boolean) || ["gemini-2.5-flash", "gemini-flash-latest"];
        const haikuModels: string[] = process.env.VERTEX_GEMINI_HAIKU_MODEL?.split(',').map(key => key?.trim()).filter(Boolean) || ["gemini-2.5-flash-lite", "gemini-flash-lite-latest"];
        const opusWeights: ModelWithWeight[] = [];
        const claudeWeights: ModelWithWeight[] = [];
        const haikuWeights: ModelWithWeight[] = [];
        for (let i = 0; i < apiKeys.length; i++) {
            const apiKey = apiKeys[i];
            for (let model of opusModels) {
                const name = `vertex/gemini-${i}/${model}`;
                this.modelRegistry.register(name, new VertexGeminiAnthropicModel({
                    apiKey,
                    model
                }))
                const weight = 10;
                opusWeights.push({name, weight});
            }
            for (let model of claudeModels) {
                const name = `vertex/gemini-${i}/${model}`;
                this.modelRegistry.register(name, new VertexGeminiAnthropicModel({
                    apiKey,
                    model
                }))
                const weight = 10;
                claudeWeights.push({name, weight});
            }
            for (let model of haikuModels) {
                const name = `vertex/gemini-${i}/${model}`;
                this.modelRegistry.register(name, new VertexGeminiAnthropicModel({
                    apiKey,
                    model
                }))
                const weight = 10;
                haikuWeights.push({name, weight});
            }
        }

        this.modelRegistry.register("opus", new LoadBalancedAnthropicModel(this.modelRegistry, opusWeights));
        this.modelRegistry.register("claude", new LoadBalancedAnthropicModel(this.modelRegistry, claudeWeights));
        this.modelRegistry.register("haiku", new LoadBalancedAnthropicModel(this.modelRegistry, haikuWeights));
    }
}

export const anthropicModels = new AnthropicModels();
void anthropicModels.registerGeminiModels();