import {
  BaseChatModel,
  BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import { ChatResult } from "@langchain/core/outputs";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { BaseMessage } from "@langchain/core/messages";

export interface RoutingChatModelInput extends BaseChatModelParams {
  mainModels: BaseChatModel[];
  fallbackModels: BaseChatModel[];
  failureCooldown?: number; // in milliseconds
}

type ModelStatus = {
  model: BaseChatModel;
  isAvailable: boolean;
  lastFailure: number;
};

/**
 * Simple RoutingChatModel class that extends BaseChatModel which contructor can take in 2 sets of models: main and fallback.
 * It will overrides the _invoke method to pass down  the message to main models in a round-robin fashion.
 * If model returns an error, it will fallback to the next model in the list.
 * The failed model will not be used again in the round-robin after a configurable duration has passed. This duration is optional and defaults to 10 seconds.
 * If all models in main list fail, it will fallback to the fallback models which will be chosen randomly.
 * **/
export class RoutingChatModel extends BaseChatModel {
  private mainModels: ModelStatus[];
  private fallbackModels: ModelStatus[];
  private failureCooldown: number;
  private mainModelIndex = 0;

  constructor(fields: RoutingChatModelInput) {
    super(fields);
    this.mainModels = fields.mainModels.map((model) => ({
      model,
      isAvailable: true,
      lastFailure: 0,
    }));
    this.fallbackModels = fields.fallbackModels.map((model) => ({
      model,
      isAvailable: true,
      lastFailure: 0,
    }));
    this.failureCooldown = fields.failureCooldown ?? 10000; // 10 seconds
  }

  _llmType(): string {
    return "routing_chat_model";
  }

  private getNextAvailableMainModel(): ModelStatus | null {
    const now = Date.now();
    const initialIndex = this.mainModelIndex;
    do {
      const modelStatus = this.mainModels[this.mainModelIndex];
      
      if (!modelStatus.isAvailable && now - modelStatus.lastFailure > this.failureCooldown) {
        modelStatus.isAvailable = true;
      }
      
      if (modelStatus.isAvailable) {
        const modelToReturn = modelStatus;
        this.mainModelIndex = (this.mainModelIndex + 1) % this.mainModels.length;
        return modelToReturn;
      }
      
      this.mainModelIndex = (this.mainModelIndex + 1) % this.mainModels.length;
    } while (this.mainModelIndex !== initialIndex);
    
    return null;
  }

  private getRandomFallbackModel(): ModelStatus | null {
    if (this.fallbackModels.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * this.fallbackModels.length);
    return this.fallbackModels[randomIndex];
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    let mainModelStatus = this.getNextAvailableMainModel();

    while (mainModelStatus) {
      try {
        return result;
      } catch (e) {
        mainModelStatus.isAvailable = false;
        mainModelStatus.lastFailure = Date.now();
        mainModelStatus = this.getNextAvailableMainModel();
      }
    }

    const fallbackModelStatus = this.getRandomFallbackModel();
    if (fallbackModelStatus) {
      try {
        return result;
      } catch (e) {
        // If fallback also fails, we throw the error
        throw new Error(
          "All main and fallback models failed to generate a response."
        );
      }
    }

    throw new Error("No available models to handle the request.");
  }
}