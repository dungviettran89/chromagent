import { Command } from "commander";
import { modelCommand } from "./ModelCommand";
import { anthropicModels } from "../AnthropicModels";
import prompts from "prompts";
import { AnthropicModel, AnthropicMessageRequest } from "@chromagent/core";

export interface ChatModelOptions {
  prompt?: boolean;
}

/**
 * Similar to ModelListCommand, this command implement a simple chat interface for user to talk with a
 * select model. it takes in 2 arguments
 * - model: Model to chat with (required)
 * - prompt: Initial prompt to send to model (optional)
 *
 * It also take in the following options:
 * - -p: To exit immediately after first response without waiting for the next prompt.
 *
 * This command will open a simple chat interface using prompts package to allow user to chat with
 * the models. Conversation is stored in a simple array in the memory only.
 *
 */
export class ModelChatCommand {
  command: Command;

  constructor() {
    this.command = modelCommand.command
      .command("chat <model> [prompt]")
      .description("Chat with a model")
      .option(
        "-p, --prompt",
        "Exit immediately after first response without waiting for the next prompt."
      )
      .action(
        (model: string, prompt: string | undefined, options: ChatModelOptions) =>
          this.action(model, prompt, options)
      );
  }

  async action(
    modelId: string,
    initialPrompt: string | undefined,
    options: ChatModelOptions
  ) {
    const model = anthropicModels.modelRegistry.get(modelId);
    if (!model) {
      console.error(`Model ${modelId} not found`);
      return;
    }

    const conversation: any[] = [];

    if (initialPrompt) {
      await this.sendMessage(model, modelId, initialPrompt, conversation);
    }

    if (options.prompt) {
      return;
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await prompts({
        type: "text",
        name: "prompt",
        message: ">",
      });

      if (!response.prompt) {
        break;
      }
      await this.sendMessage(model, modelId, response.prompt, conversation);
    }
  }

  private async sendMessage(
    model: AnthropicModel,
    modelId: string,
    prompt: string,
    conversation: any[]
  ) {
    conversation.push({ role: "user", content: prompt });
    
    const request: AnthropicMessageRequest = {
      model: modelId,
      messages: conversation,
      max_tokens: 1024,
    };
    
    const response = await model.message(request);
    const responseContent = response.content[0].text;
    conversation.push({ role: "assistant", content: responseContent });
    console.log(responseContent);
  }
}

export const chatCommand = new ModelChatCommand();
