import {cliApplication} from "./CliApplication";
import {Command} from "commander";
import express from "express";
import {AnthropicExpressMiddleware} from "@chromagent/core";
import {anthropicModels} from "./AnthropicModels";

/**
 * Command that starts an Express server exposing an Anthropic-compatible API.
 *
 * This command creates an HTTP server that exposes an Anthropic-compliant API
 * at the endpoint `/api/anthropic/v1/messages`. It uses registered Anthropic models
 * from the AnthropicModels module and handles both streaming and non-streaming requests.
 *
 * Usage: `chromagent-cli serve`
 *
 * Options:
 * - `-p, --port <number>`: Port number for the server (default: 8080)
 */
export class ServeCommand {
    readonly command: Command;

    constructor() {
        this.command = cliApplication.command
            .command("serve")
            .description("Start an Express server that exposes an Anthropic-compatible API at /api/anthropic/v1/messages")
            .option('-p, --port <number>', 'Port for the server', '8080')
            .action(async (options) => {
                const port = parseInt(options.port) || 8080;

                // Create Express app
                const app = express();

                // Middleware to parse JSON
                app.use(express.json());

                // Create Anthropic middleware instance
                const middleware = new AnthropicExpressMiddleware(anthropicModels.modelRegistry, {
                    defaultOpusModel: "opus",
                    defaultSonnetModel: "sonnet",
                    defaultHaikuModel: "haiku",
                    defaultModel: "sonnet"
                });

                // Register the Anthropic API endpoint
                app.post("/api/anthropic/v1/messages", middleware.create());

                // Start the server
                app.listen(port, () => {
                    console.log(`Chromagent Anthropic API server running on port ${port}`);
                    console.log(`API endpoint: http://localhost:${port}/api/anthropic/v1/messages`);
                });
            });
    }
}

// Export the instance
export const serveCommand = new ServeCommand();