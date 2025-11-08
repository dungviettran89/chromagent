import { Request, Response } from 'express';
import { AnthropicModelRegistry } from './AnthropicModelRegistry';
import { AnthropicMessageRequest, AnthropicMessageResponse } from './AnthropicModel';

/**
 * Middleware that exposes registered Anthropic models as a compliant API endpoint.
 * This class takes in an AnthropicModelRegistry as parameter and uses it to locate models and expose them as
 * an Anthropic compliant API.
 * It exposes a method called create() which creates a new handler which can be used
 * with an Express server as a middleware callback. Usage will be like this: express.use("/api/anthropic/v1/message",anthropicExpressMiddleware.create())
 * AnthropicModel doesn't support streaming, so it intelligently converts non-streaming responses to streaming responses of Anthropic API
 *
 * It will also take in default model name for opus, sonnet and haiku which allow developer to auto select default model if
 * the model is not found in registry and contains the respective name (eg model name contains opus not found -> map to defaultOpus model)
 * If model not found and doesn't contain any keyword, map it to defaultModel. If none of those values are configured, please
 * throw model not found error
 * The following parameter are optional and will be:
 * defaultOpusModel, defaultSonnetModel, defaultHaikuModel, defaultModel.
 *
 */
export class AnthropicExpressMiddleware {
    private registry: AnthropicModelRegistry;
    private defaultOpusModel?: string;
    private defaultSonnetModel?: string;
    private defaultHaikuModel?: string;
    private defaultModel?: string;

    /**
     * Creates a new instance of AnthropicExpressMiddleware
     * @param registry - The AnthropicModelRegistry instance to use for model lookup
     * @param defaultOpusModel - The default model to use for 'opus' models
     * @param defaultSonnetModel - The default model to use for 'sonnet' models
     * @param defaultHaikuModel - The default model to use for 'haiku' models
     * @param defaultModel - The default model to use if no other model is found
     */
    constructor(registry: AnthropicModelRegistry, { defaultOpusModel, defaultSonnetModel, defaultHaikuModel, defaultModel }: { defaultOpusModel?: string, defaultSonnetModel?: string, defaultHaikuModel?: string, defaultModel?: string } = {}) {
        this.registry = registry;
        this.defaultOpusModel = defaultOpusModel;
        this.defaultSonnetModel = defaultSonnetModel;
        this.defaultHaikuModel = defaultHaikuModel;
        this.defaultModel = defaultModel;
    }

    /**
     * Creates an Express middleware handler for the Anthropic API
     * @returns An Express request handler that processes Anthropic API requests
     */
    create() {
        return async (req: Request, res: Response) => {
            try {
                // Parse incoming request
                const anthropicRequest: AnthropicMessageRequest = req.body;

                // Validate the request
                if (!anthropicRequest.model || !anthropicRequest.messages || !Array.isArray(anthropicRequest.messages) || anthropicRequest.max_tokens === undefined) {
                    res.status(400).json({
                        error: {
                            type: 'invalid_request_error',
                            message: 'Missing required fields: model, messages, or max_tokens'
                        }
                    });
                    return;
                }

                // Look up the requested model in the registry
                let model = this.registry.get(anthropicRequest.model);

                if (!model) {
                    const modelName = anthropicRequest.model.toLowerCase();
                    if (this.defaultOpusModel && modelName.includes('opus')) {
                        model = this.registry.get(this.defaultOpusModel);
                    } else if (this.defaultSonnetModel && modelName.includes('sonnet')) {
                        model = this.registry.get(this.defaultSonnetModel);
                    } else if (this.defaultHaikuModel && modelName.includes('haiku')) {
                        model = this.registry.get(this.defaultHaikuModel);
                    } else if (this.defaultModel) {
                        model = this.registry.get(this.defaultModel);
                    }
                }

                if (!model) {
                    res.status(404).json({
                        error: {
                            type: 'model_not_found',
                            message: `Model '${anthropicRequest.model}' not found`
                        }
                    });
                    return;
                }

                // Call the model with the parsed request
                const response: AnthropicMessageResponse = await model.message(anthropicRequest);

                // Check if streaming is requested
                if (anthropicRequest.stream) {
                    // Send streaming response
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                    });

                    // Send completion response as streaming events
                    this.sendStreamingResponse(res, response);
                } else {
                    // Send regular JSON response
                    res.status(200).json(response);
                }
            } catch (error) {
                console.error('Error processing Anthropic API request:', error);
                
                // Send error response
                res.status(500).json({
                    error: {
                        type: 'api_error',
                        message: error instanceof Error ? error.message : 'Internal server error'
                    }
                });
            }
        }
    }

    /**
     * Converts a non-streaming response to streaming events and sends them to the client
     * @param res - The Express response object
     * @param response - The Anthropic API response to convert to streaming format
     */
    private sendStreamingResponse(res: Response, response: AnthropicMessageResponse): void {
        // Send initial event
        res.write(`data: ${JSON.stringify({
            type: 'message_start',
            message: {
                id: response.id,
                type: 'message',
                role: response.role,
                content: [],
                model: response.model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: response.usage.input_tokens, output_tokens: 0 }
            }
        })}\n\n`);

        // Send content blocks as content_block_start events
        response.content.forEach((contentBlock, index) => {
            res.write(`data: ${JSON.stringify({
                type: 'content_block_start',
                index: index,
                content_block: contentBlock
            })}\n\n`);
            
            // For text content, simulate streaming by sending text_delta events
            if (contentBlock.type === 'text' && contentBlock.text) {
                // Simulate streaming by sending the text in chunks
                // In a real implementation, you'd have actual streaming from the model
                const text = contentBlock.text;
                const chunkSize = 10; // characters per chunk
                
                for (let i = 0; i < text.length; i += chunkSize) {
                    const chunk = text.substring(i, i + chunkSize);
                    
                    res.write(`data: ${JSON.stringify({
                        type: 'text_delta',
                        text: chunk
                    })}\n\n`);
                }
            }
            
            // Send content_block_stop event
            res.write(`data: ${JSON.stringify({
                type: 'content_block_stop',
                index: index
            })}\n\n`);
        });

        // Send message delta with usage information
        res.write(`data: ${JSON.stringify({
            type: 'message_delta',
            delta: {
                stop_reason: response.stop_reason,
                stop_sequence: response.stop_sequence
            },
            usage: {
                output_tokens: response.usage.output_tokens
            }
        })}\n\n`);

        // Send final message stop event
        res.write(`data: ${JSON.stringify({
            type: 'message_stop'
        })}\n\n`);

        // End the stream
        res.end();
    }
}