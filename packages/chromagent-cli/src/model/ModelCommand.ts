import {cliApplication} from "../CliApplication";
import {Command} from "commander";

/**
 * Base command to interact with different models
 */
export class ModelCommand {
    readonly command: Command;

    constructor() {
        this.command = cliApplication.command
            .command("model")
            .description("Allow interaction with different models")
    }
}

export const modelCommand = new ModelCommand();