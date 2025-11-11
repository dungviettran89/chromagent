import {AnthropicModel, AnthropicMessageResponse} from "./AnthropicModel";
import {AnthropicModelRegistry} from "./AnthropicModelRegistry";
import {AnthropicUtils} from "./AnthropicUtils";
import {Message, MessageParam, MessageStream} from "@anthropic-ai/sdk/messages";

type ModelWithWeight = {
    name: string;
    weight: number;
};

/**
 * This class provide randomized load balancing capability for Anthropic Model.
 * It takes in an AnthropicModelRegistry and a list of model name + weight.
 * When it invoked, I will select one model based on the weight to trigger
 * If the model throws an error or return empty content and usage, it will be removed
 * from the current invocation list and the next model will be selected.
 * The check should use AnthropicUtils.isValidResponse()
 * This process continue until the last model, then their response / error is simply returned
 * back to caller.

 */
export class LoadBalancedAnthropicModel implements AnthropicModel {
    private readonly registry: AnthropicModelRegistry;
    private models: ModelWithWeight[];
    private readonly errorTimeoutMs: number;
    private failedModels: Map<string, number> = new Map();

    constructor(registry: AnthropicModelRegistry, models: ModelWithWeight[], errorTimeoutMs: number = 60000) {
        this.registry = registry;
        this.models = models;
        this.errorTimeoutMs = errorTimeoutMs;
    }

    async invoke(messages: MessageParam[]): Promise<Message | MessageStream> {
        const candidateModels = this.models.filter(model => {
            const lastFailureTime = this.failedModels.get(model.name);
            return !lastFailureTime || (Date.now() - lastFailureTime >= this.errorTimeoutMs);
        });

        if (candidateModels.length === 0) {
            throw new Error("No models available to handle the request after considering error timeouts.");
        }

        const modelsToTry = [...candidateModels];
        while (modelsToTry.length > 0) {
            const modelWithWeight = this.selectModel(modelsToTry);
            const model = this.registry.get(modelWithWeight.name);

            if (!model) {
                this.failedModels.set(modelWithWeight.name, Date.now());
                const index = modelsToTry.findIndex(m => m.name === modelWithWeight.name);
                modelsToTry.splice(index, 1);
                continue;
            }

            try {
                const response = await model.invoke(messages);
                if (AnthropicUtils.isValidResponse(response as AnthropicMessageResponse)) {
                    this.failedModels.delete(modelWithWeight.name); // Clear failure on success
                    return response;
                } else {
                    this.failedModels.set(modelWithWeight.name, Date.now());
                    const index = modelsToTry.findIndex(m => m.name === modelWithWeight.name);
                    modelsToTry.splice(index, 1);
                }
            } catch (e) {
                this.failedModels.set(modelWithWeight.name, Date.now());
                const index = modelsToTry.findIndex(m => m.name === modelWithWeight.name);
                modelsToTry.splice(index, 1);
                if (modelsToTry.length === 0) {
                    throw e;
                }
            }
        }
        throw new Error("No models available to handle the request");
    }

    private selectModel(models: ModelWithWeight[]): ModelWithWeight {
        const totalWeight = models.reduce((sum, model) => sum + model.weight, 0);
        let random = Math.random() * totalWeight;
        for (const model of models) {
            if (random < model.weight) {
                return model;
            }
            random -= model.weight;
        }
        return models[models.length - 1];
    }


}