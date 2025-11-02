import {AnthropicMessageRequest, AnthropicMessageResponse, AnthropicModel} from "./AnthropicModel";

/**
 * Configuration options for OpenAIAnthropicModel
 */
interface OpenAIConfig {
    /** Base URL for the OpenAI-compatible API */
    url: string;
    /** API key for authentication */
    apiKey: string;
    /** The model name to use for all requests */
    model: string;
}

/**
 * This class performs translation from an OpenAI compatible endpoint to Anthropic API format
 * Image, Tool call should be supported.
 * This class can be configured with  parameters: url, apiKey and model.
 * All request to this class will be translated to call against the model regardless of requested model in the request
 * Instead of using javascript package, it only use fetch API to perform the request
 *
 */
export class OpenAIAnthropicModel implements AnthropicModel {
    private config: OpenAIConfig;

    /**
     * Creates a new instance of OpenAIAnthropicModel
     * @param config - Configuration options containing URL, API key and model name
     */
    constructor(config: OpenAIConfig) {
        this.config = config;
    }

    /**
     * Sends a message to the OpenAI-compatible API and returns a response transformed to Anthropic format.
     *
     * @param request - The Anthropic message request to be transformed and sent
     * @returns A promise that resolves to the API response in Anthropic format
     */
    async message(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
        // Transform Anthropic request to OpenAI format
        const openAIRequest = this.transformToOpenAIFormat(request);

        const response = await fetch(`${this.config.url}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(openAIRequest)
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
        }

        const openAIResponse = await response.json();

        // Transform OpenAI response back to Anthropic format
        return this.transformToAnthropicFormat(openAIResponse, request);
    }

    /**
     * Transforms Anthropic API request format to OpenAI format
     */
    private transformToOpenAIFormat(request: AnthropicMessageRequest) {
        // Transform messages - defining with OpenAI compatible roles including 'system'
        const openAIMessages: Array<{
            role: 'user' | 'assistant' | 'system';
            content: string | Array<{
                type: 'text' | 'image_url';
                text?: string;
                image_url?: { url: string };
            }>;
        }> = request.messages.map(msg => {
            if (typeof msg.content === 'string') {
                // Simple text message
                return {
                    role: msg.role,
                    content: msg.content
                };
            } else {
                // Complex content with text and images
                const contentParts: Array<{
                    type: 'text' | 'image_url';
                    text?: string;
                    image_url?: { url: string };
                }> = [];

                for (const block of msg.content) {
                    if (block.type === 'text') {
                        contentParts.push({
                            type: 'text',
                            text: block.text || ''
                        });
                    } else if (block.type === 'image' && block.source?.type === 'base64') {
                        // Convert base64 image to data URL format
                        const mimeType = block.source.media_type;
                        const base64Data = block.source.data;
                        const dataUrl = `data:${mimeType};base64,${base64Data}`;

                        contentParts.push({
                            type: 'image_url',
                            image_url: {url: dataUrl}
                        });
                    }
                }

                return {
                    role: msg.role,
                    content: contentParts
                };
            }
        });

        // OpenAI has system role in messages, whereas Anthropic has a separate system parameter
        // If there's a system prompt, add it as a system role message for OpenAI
        if (request.system) {
            openAIMessages.unshift({
                role: 'system',
                content: request.system
            });
        }

        // Prepare the OpenAI request
        const openAIRequest: any = {
            model: this.config.model, // Use the configured model, not the one from the request
            messages: openAIMessages,
        };

        // Add optional parameters if present
        if (typeof request.temperature !== 'undefined') {
            openAIRequest.temperature = request.temperature;
        }
        if (typeof request.max_tokens !== 'undefined') {
            openAIRequest.max_tokens = request.max_tokens;
        }
        if (request.stop_sequences && request.stop_sequences.length > 0) {
            openAIRequest.stop = request.stop_sequences;
        }

        // Add tools if provided
        if (request.tools && request.tools.length > 0) {
            openAIRequest.tools = request.tools.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema
                }
            }));

            // Add tool choice if provided
            if (request.tool_choice) {
                if (request.tool_choice.type === 'tool') {
                    openAIRequest.tool_choice = {type: 'function', function: {name: request.tool_choice.name}};
                } else {
                    openAIRequest.tool_choice = request.tool_choice.type;
                }
            }
        }

        return openAIRequest;
    }

    /**
     * Transforms OpenAI API response format to Anthropic format
     */
    private transformToAnthropicFormat(
        openAIResponse: any,
        originalRequest: AnthropicMessageRequest
    ): AnthropicMessageResponse {
        const firstChoice = openAIResponse.choices[0];
        const openAIContent = firstChoice.message.content;
        const openAIToolCalls = firstChoice.message.tool_calls;

        // Convert content to Anthropic format
        const content: Array<{
            type: 'text' | 'tool_use';
            text?: string;
            id?: string;
            name?: string;
            input?: Record<string, any>;
        }> = [];

        // Add text content if it exists
        if (openAIContent) {
            content.push({
                type: 'text',
                text: openAIContent
            });
        }

        // Map tool calls if present
        if (openAIToolCalls) {
            for (const toolCall of openAIToolCalls) {
                content.push({
                    type: 'tool_use',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: JSON.parse(toolCall.function.arguments)
                });
            }
        }

        // Map finish reason to Anthropic stop reason
        let stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | 'model_context_window_exceeded' | null = null;
        let stopSequence: string | null = null;

        if (firstChoice.finish_reason) {
            switch (firstChoice.finish_reason) {
                case 'stop':
                    stopReason = 'end_turn';
                    break;
                case 'length':
                    stopReason = 'max_tokens';
                    break;
                case 'tool_calls':
                    stopReason = 'tool_use';
                    break;
                case 'content_filter':
                    stopReason = 'refusal';
                    break;
                case 'function_call':
                    stopReason = 'tool_use';
                    break;
                default:
                    stopReason = 'end_turn';
            }
        }

        if (firstChoice.finish_reason === 'stop' && originalRequest.stop_sequences) {
            // Determine which stop sequence was hit, if possible
            // This is a simplified approach - in practice, you'd need to check which sequence was encountered
            stopSequence = originalRequest.stop_sequences[0] || null;
        }

        // Create the Anthropic response object
        return {
            id: openAIResponse.id || `msg_${Date.now()}`, // Use OpenAI ID if available, otherwise generate one
            type: 'message',
            role: 'assistant',
            content: content,
            model: this.config.model, // Use the configured model
            stop_reason: stopReason,
            stop_sequence: stopSequence,
            usage: {
                input_tokens: openAIResponse.usage?.prompt_tokens || 0,
                output_tokens: openAIResponse.usage?.completion_tokens || 0
            }
        };
    }
}