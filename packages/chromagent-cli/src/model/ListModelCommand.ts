import {Command} from "commander";
import {ModelCommand} from "./ModelCommand";

export interface ListModelOptions {

}

/**
 * List all available models
 */
export class ListModelCommand {
    command: Command;

    constructor(modelCommand: ModelCommand) {
        this.command = modelCommand.command.command("list")
            .description("List available model")
            .action((options) => this.action(options));
    }

    async action(options: ListModelOptions) {
    }
}