import {Command} from "commander";
import {modelCommand} from "./ModelCommand";
import {anthropicModels} from "../AnthropicModels";

export interface ListModelOptions {

}

/**
 * List all available models from AnthropicModels in a nice format
 */
export class ModelListCommand {
    command: Command;

    constructor() {
        this.command = modelCommand.command.command("list")
            .description("List available model")
            .action((options) => this.action(options));
    }

    /**
     * List all available model in AnthropicModels registry
     * @param options
     */
    async action(options: ListModelOptions) {
        const models = anthropicModels.modelRegistry.list();
        for (const model of models) {
            console.log(model);
        }
    }
}

export const listCommand = new ModelListCommand();