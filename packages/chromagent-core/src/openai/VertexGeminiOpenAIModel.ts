import {OpenAIChatCompletionsRequest, OpenAIChatCompletionsResponse, OpenAIModel} from "./OpenAIModel";

/**
 * Configuration options for VertexGeminiOpenAIModel
 */
interface VertexConfig {
    /** API Key for authentication with Google Vertex AI */
    apiKey: string;
    /** The model name to use for all requests */
    model: string;
    /** The location/region for Google Vertex AI */
    location?: string;
    /** The project ID for Google Vertex AI */
    project?: string;
}

/**
 * Maps Google Vertex Gemini API format to OpenAI API format
 */
export class VertexGeminiOpenAIModel implements OpenAIModel {
    private config: VertexConfig;

    /**
     * Creates a new instance of VertexGeminiOpenAIModel
     * @param config - Configuration options containing API key and model name
     */
    constructor(config: VertexConfig) {
        this.config = config;
    }

    /**
     * Sends a message to the Vertex Gemini API and returns a complete response in OpenAI format.
     *
     * @param request - The message request containing model, messages, and other configuration
     * @returns A promise that resolves to the API response with content, model info, and usage statistics
     */
    async chatCompletion(request: OpenAIChatCompletionsRequest): Promise<OpenAIChatCompletionsResponse> {
        // Transform OpenAI request to Vertex Gemini format
        const vertexRequest = this.transformToVertexFormat(request);

        // Build the URL for the Gemini API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(vertexRequest)
        });

        if (!response.ok) {
            throw new Error(`Vertex API error: ${response.status} ${await response.text()}`);
        }

        const vertexResponse = await response.json();

        // Transform Vertex response back to OpenAI format
        return this.transformToOpenAIFormat(vertexResponse, request);
    }


    /**
     * Transforms OpenAI API request format to Vertex Gemini API format
     */
    private transformToVertexFormat(request: OpenAIChatCompletionsRequest) {
        // Transform messages, excluding system messages
        const vertexMessages = request.messages
            .filter(msg => msg.role !== 'system') // Filter out system messages
            .map(msg => {
                // Handle content that could be a string or array of content blocks
                const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

                if (typeof msg.content === 'string') {
                    parts.push({text: msg.content});
                } else {
                    for (const block of msg.content) {
                        if (block.type === 'text') {
                            parts.push({text: block.text || ''});
                        } else if (block.type === 'image_url' && block.image_url) {
                            // Extract base64 data from data URL
                            if (block.image_url.url.startsWith('data:image')) {
                                const [header, base64Data] = block.image_url.url.split(',');
                                const mimeType = header.replace('data:', '').split(';')[0];
                                if (base64Data && mimeType) {
                                    parts.push({
                                        inlineData: {
                                            mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                                            data: base64Data
                                        }
                                    });
                                }
                            }
                        }
                    }
                }

                return {
                    role: msg.role === 'user' || msg.role === 'system' ? 'user' : 'model', // Gemini uses 'user'/'model' instead of OpenAI roles
                    parts: parts
                };
            });

        const vertexRequest: any = {
            contents: vertexMessages,
            generationConfig: {
                // Map OpenAI temperature to Vertex
                ...(typeof request.temperature !== 'undefined' && {temperature: request.temperature}),
                // Map max_tokens to maxOutputTokens in Vertex
                ...(typeof request.max_tokens !== 'undefined' && {maxOutputTokens: request.max_tokens}),
                // Add stop sequences if provided
                ...(request.stop && Array.isArray(request.stop) && request.stop.length > 0 && {stopSequences: request.stop}),
                ...(typeof request.top_p !== 'undefined' && {topP: request.top_p}),
            }
        };

        // Add system instructions if system prompt is provided (looking for system role in messages)
        const systemMessage = request.messages.find(msg => msg.role === 'system');
        if (systemMessage && typeof systemMessage.content === 'string') {
            vertexRequest.systemInstruction = {
                role: 'system',
                parts: [{text: systemMessage.content}]
            };
        }

        // Add safety settings (optional)
        vertexRequest.safetySettings = [
            {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_ONLY_HIGH'
            }
        ];

        // Add tools if provided
        if (request.tools && request.tools.length > 0) {
            vertexRequest.tools = [{
                functionDeclarations: request.tools.map(tool => ({
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }))
            }];
        }

        // Tool choice is not directly supported in Gemini API in the same way as OpenAI
        // The model will decide to use tools based on the function definitions

        return vertexRequest;
    }

    /**
     * Transforms Vertex Gemini API response format to OpenAI format
     */
    private transformToOpenAIFormat(vertexResponse: any, originalRequest: OpenAIChatCompletionsRequest): OpenAIChatCompletionsResponse {
        // Extract the first candidate from the response
        const candidate = vertexResponse.candidates?.[0];
        if (!candidate) {
            throw new Error('No candidates in Vertex response');
        }

        // Extract content parts
        let textParts: string[] = [];
        const toolCalls: Array<{
            id: string;
            type: 'function';
            function: {
                name: string;
                arguments: string;
            };
        }> = [];

        for (const part of candidate.content.parts) {
            if (part.text) {
                textParts.push(part.text);
            } else if (part.functionCall) {
                // Map function calls to tool calls
                toolCalls.push({
                    id: `call_${Date.now()}`, // Generate a fake ID
                    type: 'function',
                    function: {
                        name: part.functionCall.name as string,
                        arguments: JSON.stringify(part.functionCall.args || {})
                    }
                });
            }
        }

        // Combine all text parts into a single string
        const content = textParts.join('');

        // Extract usage statistics
        const usageMetadata = vertexResponse.usageMetadata;
        const usage = {
            prompt_tokens: usageMetadata?.promptTokenCount || 0,
            completion_tokens: usageMetadata?.candidatesTokenCount || 0,
            total_tokens: (usageMetadata?.promptTokenCount || 0) + (usageMetadata?.candidatesTokenCount || 0)
        };

        // Map finish reason
        let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' = 'stop';
        if (candidate.finishReason) {
            switch (candidate.finishReason) {
                case 'STOP':
                    finishReason = 'stop';
                    break;
                case 'MAX_TOKENS':
                    finishReason = 'length';
                    break;
                case 'SAFETY':
                    finishReason = 'content_filter';
                    break;
                case 'RECITATION':
                    finishReason = 'content_filter';
                    break;
                case 'FINISH_REASON_STOP':
                    finishReason = 'stop';
                    break;
                case 'FINISH_REASON_MAX_TOKENS':
                    finishReason = 'length';
                    break;
                case 'FINISH_REASON_SAFETY':
                    finishReason = 'content_filter';
                    break;
                case 'FINISH_REASON_RECITATION':
                    finishReason = 'content_filter';
                    break;
                case 'OTHER':
                    finishReason = 'stop';
                    break;
                default:
                    finishReason = 'stop';
            }
        }

        // Create the base message object
        let messageObj: any = {
            role: 'assistant' as const,
        };

        // For OpenAI format, if there are tool calls in the original Gemini response, content should be null
        if (vertexResponse.candidates?.[0]?.content?.parts?.some((part: any) => part.functionCall)) {
            messageObj.content = null; // When there are function calls, content is usually null in OpenAI format
            messageObj.tool_calls = toolCalls;
        } else {
            // Ensure content is never an array for OpenAI format
            if (Array.isArray(content)) {
                messageObj.content = content.length > 0 ? content[0] : null;
            } else {
                messageObj.content = content || null;
            }
        }

        // Ensure content is never an array (final safety check)
        // But if we have function calls (tool calls), content should definitely be null, not processed from an array
        if (Array.isArray(messageObj.content) &&
            !(vertexResponse.candidates?.[0]?.content?.parts?.some((part: any) => part.functionCall))) {
            messageObj.content = messageObj.content.length > 0 ? messageObj.content[0] : null;
        }

        const choices = [{
            index: 0,
            message: messageObj,
            finish_reason: finishReason,
            logprobs: null // Gemini doesn't provide detailed logprobs in this API
        }];

        // Create the OpenAI response object
        return {
            id: `chatcmpl-${Date.now()}`, // Generate a fake ID in OpenAI format
            choices: choices,
            model: this.config.model, // Use the configured model
            object: 'chat.completion',
            usage: usage,
            created: Math.floor(Date.now() / 1000) // Unix timestamp
        };
    }
}