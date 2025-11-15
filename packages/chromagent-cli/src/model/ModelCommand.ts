import {CliApplication} from "../CliApplication";
import {Command} from "commander";

/**
 * Base command to interact with different models
 */
export class ModelCommand {
     readonly command: Command;
    constructor(cliApplication: CliApplication) {
        this.command = cliApplication.command
            .command("model")
            .description("Allow interaction with different models")
    }
}