import { OpenAIChatCompletionsRequest, OpenAIChatCompletionsResponse, OpenAIModel, OpenAIChatCompletionChunk } from "./OpenAIModel";

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
 * Maps Google Vertex Gemini API format to OpenAI API format.
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
    async chatCompletion(request: OpenAIChatCompletionsRequest): Promise<OpenAIChatCompletionsResponse | AsyncIterable<OpenAIChatCompletionChunk>> {
        // Transform OpenAI request to Vertex Gemini format
        const vertexRequest = this.transformToVertexFormat(request);

        // Build the URL for the Gemini API
        let url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

        if (request.stream) {
            url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;
        }

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

        if (request.stream) {
            return this.transformToOpenAIStream(response, request);
        }

        const vertexResponse = await response.json();

        // Transform Vertex response back to OpenAI format
        return this.transformToOpenAIFormat(vertexResponse, request);
    }

    /**
     * Transforms OpenAI API request format to Vertex Gemini API format
     */
    private transformToVertexFormat(request: OpenAIChatCompletionsRequest) {
        // Transform messages
        const vertexMessages: any[] = [];
        let systemInstruction: any = undefined;

        // Handle system messages
        const systemMessages = request.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            const parts = systemMessages.map(msg => {
                if (typeof msg.content === 'string') {
                    return { text: msg.content };
                }
                return { text: '' }; // Fallback for non-string system content
            });
            systemInstruction = {
                role: 'system',
                parts: parts
            };
        }

        // Filter out system messages for the main conversation history
        const conversationMessages = request.messages.filter(msg => msg.role !== 'system');

        // Merge consecutive messages of the same role
        for (let i = 0; i < conversationMessages.length; i++) {
            const msg = conversationMessages[i];
            const role = msg.role === 'user' ? 'user' : 'model';

            // Handle content
            const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string }; functionCall?: any; functionResponse?: any }> = [];

            if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
            } else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    if (block.type === 'text') {
                        parts.push({ text: block.text || '' });
                    } else if (block.type === 'image_url' && block.image_url) {
                        if (block.image_url.url.startsWith('data:image')) {
                            const [header, base64Data] = block.image_url.url.split(',');
                            const mimeType = header.replace('data:', '').split(';')[0];
                            if (base64Data && mimeType) {
                                parts.push({
                                    inlineData: {
                                        mimeType: mimeType as any,
                                        data: base64Data
                                    }
                                });
                            }
                        } else {
                            // Handle non-data URLs (e.g. https://...) if needed, or just pass as text?
                            // Gemini usually requires base64 for images unless using Google Cloud Storage URIs.
                            // For now, we'll assume base64 or skip.
                        }
                    }
                }
            }

            // Handle tool calls (assistant message)
            if (msg.role === 'assistant' && msg.tool_calls) {
                for (const toolCall of msg.tool_calls) {
                    parts.push({
                        functionCall: {
                            name: toolCall.function.name,
                            args: JSON.parse(toolCall.function.arguments)
                        }
                    });
                }
            }

            // Handle tool responses (tool message)
            if (msg.role === 'tool') {
                parts.push({
                    functionResponse: {
                        name: msg.name, // OpenAI tool message doesn't always have name, but it should match the call.
                        response: {
                            name: msg.name, // We might need to find the name from the tool_call_id if not provided
                            content: msg.content
                        }
                    }
                });
            }

            // Ensure user messages have text content
            if (role === 'user' && parts.length === 0) {
                parts.push({ text: ' ' });
            }

            // Merge with previous message if same role
            if (vertexMessages.length > 0 && vertexMessages[vertexMessages.length - 1].role === role) {
                vertexMessages[vertexMessages.length - 1].parts.push(...parts);
            } else {
                vertexMessages.push({
                    role: role,
                    parts: parts
                });
            }
        }

        const vertexRequest: any = {
            contents: vertexMessages,
            generationConfig: {
                ...(typeof request.temperature !== 'undefined' && { temperature: request.temperature }),
                ...(typeof request.max_tokens !== 'undefined' && { maxOutputTokens: request.max_tokens }),
                ...(request.stop && Array.isArray(request.stop) && request.stop.length > 0 && { stopSequences: request.stop }),
                ...(typeof request.top_p !== 'undefined' && { topP: request.top_p }),
                ...(typeof request.n !== 'undefined' && { candidateCount: request.n }),
            }
        };

        if (systemInstruction) {
            vertexRequest.systemInstruction = systemInstruction;
        }

        // Add safety settings
        vertexRequest.safetySettings = [
            {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_ONLY_HIGH'
            }
        ];

        // Add tools if provided
        if (request.tools && request.tools.length > 0) {
            vertexRequest.tools = [{
                functionDeclarations: request.tools.map(tool => {
                    const parameters = JSON.parse(JSON.stringify(tool.function.parameters || {}));
                    this.cleanJsonSchema(parameters);
                    return {
                        name: tool.function.name,
                        description: tool.function.description,
                        parameters: parameters
                    };
                })
            }];
        }

        // Handle tool_choice
        if (request.tool_choice) {
            if (typeof request.tool_choice === 'string') {
                if (request.tool_choice === 'auto') {
                    vertexRequest.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
                } else if (request.tool_choice === 'none') {
                    vertexRequest.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
                } else if (request.tool_choice === 'required') {
                    vertexRequest.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
                }
            } else if (typeof request.tool_choice === 'object') {
                // Specific tool choice
                vertexRequest.toolConfig = {
                    functionCallingConfig: {
                        mode: 'ANY',
                        allowedFunctionNames: [request.tool_choice.function.name]
                    }
                };
            }
        }

        return vertexRequest;
    }

    /**
     * Cleans JSON schema to be compatible with Vertex AI
     */
    private cleanJsonSchema(value: any) {
        if (typeof value === 'object' && value !== null) {
            // Remove JSON Schema metadata fields not supported by Vertex
            delete value['$schema'];
            delete value['$id'];
            delete value['default'];
            delete value['title'];

            // Vertex AI requires type to be uppercase? No, it accepts lowercase but prefers specific types.
            // Litellm converts types to uppercase, but the API docs say lowercase is fine for some.
            // However, we must remove 'null' from types or handle nullable.

            if (value.type) {
                // Handle array of types (e.g. ["string", "null"])
                if (Array.isArray(value.type)) {
                    const types = value.type.filter((t: string) => t !== 'null');
                    if (types.length === 1) {
                        value.type = types[0];
                        value.nullable = true;
                    }
                }
            }

            // Recursively clean nested objects
            for (const key in value) {
                this.cleanJsonSchema(value[key]);
            }
        } else if (Array.isArray(value)) {
            for (const item of value) {
                this.cleanJsonSchema(item);
            }
        }
    }

    /**
     * Transforms Vertex Gemini API stream response to OpenAI stream format
     */
    private async *transformToOpenAIStream(response: Response, originalRequest: OpenAIChatCompletionsRequest): AsyncIterable<OpenAIChatCompletionChunk> {
        if (!response.body) {
            throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine.startsWith('data: ')) continue;

                    const data = trimmedLine.slice(6);
                    if (data === '[DONE]') return;

                    try {
                        const vertexChunk = JSON.parse(data);
                        const candidate = vertexChunk.candidates?.[0];

                        if (!candidate) continue;

                        const chunkId = `chatcmpl-${Date.now()}`;
                        const created = Math.floor(Date.now() / 1000);

                        // Handle content
                        if (candidate.content && candidate.content.parts) {
                            for (const part of candidate.content.parts) {
                                if (part.text) {
                                    yield {
                                        id: chunkId,
                                        object: 'chat.completion.chunk',
                                        created: created,
                                        model: this.config.model,
                                        choices: [{
                                            index: 0,
                                            delta: {
                                                role: 'assistant',
                                                content: part.text
                                            },
                                            finish_reason: null
                                        }]
                                    };
                                } else if (part.functionCall) {
                                    // Handle function call in stream
                                    // Vertex sends function call in one go usually, but we should stream it if possible or just send as delta
                                    yield {
                                        id: chunkId,
                                        object: 'chat.completion.chunk',
                                        created: created,
                                        model: this.config.model,
                                        choices: [{
                                            index: 0,
                                            delta: {
                                                role: 'assistant',
                                                tool_calls: [{
                                                    index: 0,
                                                    id: `call_${Date.now()}`,
                                                    type: 'function',
                                                    function: {
                                                        name: part.functionCall.name,
                                                        arguments: JSON.stringify(part.functionCall.args)
                                                    }
                                                }]
                                            },
                                            finish_reason: null
                                        }]
                                    };
                                }
                            }
                        }

                        // Handle finish reason
                        if (candidate.finishReason && candidate.finishReason !== 'STOP') { // STOP is usually implicit or sent at end
                            let finishReason: any = null;
                            switch (candidate.finishReason) {
                                case 'MAX_TOKENS': finishReason = 'length'; break;
                                case 'SAFETY': finishReason = 'content_filter'; break;
                                case 'RECITATION': finishReason = 'content_filter'; break;
                                case 'STOP': finishReason = 'stop'; break;
                                default: finishReason = 'stop';
                            }

                            yield {
                                id: chunkId,
                                object: 'chat.completion.chunk',
                                created: created,
                                model: this.config.model,
                                choices: [{
                                    index: 0,
                                    delta: {},
                                    finish_reason: finishReason
                                }]
                            };
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunk', e);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
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
            // Update finish reason to indicate tool calls were made
            finishReason = 'tool_calls';
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