import {AnthropicMessageRequest, AnthropicMessageResponse, AnthropicModel} from "./AnthropicModel";

/**
 * Related docs: docs/specs/ollama-chat.md
 * This class allow translating from the target ollama url into anthropic API format.
 * Image, Tool call and streaming should be supported.
 * This class can be configured with two parameter: url and model.
 * All request to this class will be translated to call against the model regardless of requested model in the request
 * Instead of using ollama javascript package, it only use fetch API to perform the request
 * Unit test will be written to target local ollama installation and use this model gemma3:1b
 *
 */

/**
 * Configuration options for OllamaAnthropicModel
 */
interface OllamaConfig {
    /** Base URL for the Ollama API */
    url: string;
    /** The model name to use for all requests */
    model: string;
}

/**
 * Transforms Anthropic API request format to Ollama API format
 */
export class OllamaAnthropicModel implements AnthropicModel {
    private config: OllamaConfig;

    /**
     * Creates a new instance of OllamaAnthropicModel
     * @param config - Configuration options containing URL and model name
     */
    constructor(config: OllamaConfig) {
        this.config = config;
    }

    /**
     * Sends a message to the Ollama API and returns a complete response.
     *
     * @param request - The message request containing model, messages, and other configuration
     * @returns A promise that resolves to the API response with content, model info, and usage statistics
     */
    async message(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
        // Transform Anthropic request to Ollama format
        const ollamaRequest = this.transformToOllamaFormat(request);

        const response = await fetch(`${this.config.url}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...ollamaRequest,
                stream: false  // Non-streaming response
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
        }

        const ollamaResponse = await response.json();

        // Transform Ollama response back to Anthropic format
        return this.transformToAnthropicFormat(ollamaResponse, request);
    }


    /**
     * Transforms Anthropic API request format to Ollama format
     */
    private transformToOllamaFormat(request: AnthropicMessageRequest) {
        // Extract system prompt if present
        let systemPrompt: string | undefined;
        let userMessages = [...request.messages];

        // If the first message has a system role, extract it
        if (userMessages.length > 0 && typeof request.system !== 'undefined') {
            systemPrompt = request.system;
        }

        // Transform messages
        const ollamaMessages = userMessages.map(msg => {
            // Handle content that could be a string or array of content blocks
            let content = '';
            const images: string[] = [];

            if (typeof msg.content === 'string') {
                content = msg.content;
            } else {
                for (const block of msg.content) {
                    if (block.type === 'text') {
                        content += block.text || '';
                    } else if (block.type === 'image' && block.source?.type === 'base64') {
                        images.push(block.source.data);
                    }
                }
            }

            // Create the Ollama message object
            const ollamaMsg: any = {
                role: msg.role,
                content: content
            };

            // Add images if any
            if (images.length > 0) {
                ollamaMsg.images = images;
            }

            return ollamaMsg;
        });

        // Prepare the Ollama request
        const ollamaRequest: any = {
            model: this.config.model, // Use the configured model, not the one from the request
            messages: ollamaMessages,
            options: {
                // Map Anthropic temperature to Ollama
                ...(typeof request.temperature !== 'undefined' && {temperature: request.temperature}),
                // Map max_tokens to num_predict in Ollama
                ...(typeof request.max_tokens !== 'undefined' && {num_predict: request.max_tokens}),
                // Add stop sequences if provided
                ...(request.stop_sequences && request.stop_sequences.length > 0 && {stop: request.stop_sequences})
            }
        };

        // Add tools if provided
        if (request.tools && request.tools.length > 0) {
            ollamaRequest.tools = request.tools.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema
                }
            }));
        }

        // Add tool choice if provided
        if (request.tool_choice) {
            if (request.tool_choice.type === 'tool') {
                ollamaRequest.tool_choice = {type: 'function', function: {name: request.tool_choice.name}};
            } else {
                ollamaRequest.tool_choice = request.tool_choice.type;
            }
        }

        return ollamaRequest;
    }

    /**
     * Transforms Ollama API response format to Anthropic format
     */
    private transformToAnthropicFormat(ollamaResponse: any, originalRequest: AnthropicMessageRequest): AnthropicMessageResponse {
        // Extract the message content
        const ollamaMessage = ollamaResponse.message;

        // Convert content to Anthropic format
        const content: Array<{
            type: 'text' | 'tool_use';
            text?: string;
            id?: string;
            name?: string;
            input?: Record<string, any>;
        }> = [
            {
                type: 'text',
                text: ollamaMessage.content
            }
        ];

        // Map tool calls if present
        if (ollamaMessage.tool_calls) {
            for (const toolCall of ollamaMessage.tool_calls) {
                content.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: toolCall.function.arguments
                });
            }
        }

        // Map stop reason and sequence
        let stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | 'model_context_window_exceeded' | null = 'end_turn';
        let stopSequence: string | null = null;

        if (ollamaResponse.done_reason) {
            switch (ollamaResponse.done_reason) {
                case 'stop':
                    stopReason = 'end_turn';
                    break;
                case 'length':
                    stopReason = 'max_tokens';
                    break;
                case 'tool_calls':
                    stopReason = 'tool_use';
                    break;
                default:
                    stopReason = 'end_turn';
            }
        }

        // Create the Anthropic response object
        return {
            id: `msg_${Date.now()}`, // Generate a fake ID since Ollama doesn't provide one
            type: 'message',
            role: 'assistant',
            content: content,
            model: this.config.model, // Use the configured model
            stop_reason: stopReason,
            stop_sequence: stopSequence,
            usage: {
                input_tokens: ollamaResponse.prompt_eval_count || 0,
                output_tokens: ollamaResponse.eval_count || 0
            }
        };
    }
}