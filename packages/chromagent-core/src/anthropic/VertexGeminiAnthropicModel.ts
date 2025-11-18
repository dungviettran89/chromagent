import {AnthropicMessageRequest, AnthropicMessageResponse, AnthropicModel} from "./AnthropicModel";

/**
 * Configuration options for VertexGeminiAnthropicModel
 */
interface VertexConfig {
    /** API Key for authentication with Google Vertex AI */
    apiKey: string;
    /** The model name to use for all requests */
    model: string;
}

/**
 * Maps Anthropic API format to Google Vertex Gemini API format
 */
export class VertexGeminiAnthropicModel implements AnthropicModel {
    private config: VertexConfig;

    /**
     * Creates a new instance of VertexGeminiAnthropicModel
     * @param config - Configuration options containing API key and model name
     */
    constructor(config: VertexConfig) {
        this.config = config;
    }

    /**
     * Sends a message to the Vertex Gemini API and returns a complete response.
     *
     * @param request - The message request containing model, messages, and other configuration
     * @returns A promise that resolves to the API response with content, model info, and usage statistics
     */
    async message(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
        // Transform Anthropic request to Vertex Gemini format
        const vertexRequest = this.transformToVertexFormat(request);

        // Build the URL for the Gemini API (using generativelanguage API instead of Vertex)
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

        // Transform Vertex response back to Anthropic format
        return this.transformToAnthropicFormat(vertexResponse, request);
    }


    /**
     * Transforms Anthropic API request format to Vertex Gemini API format
     */
    private transformToVertexFormat(request: AnthropicMessageRequest) {
        // Transform messages
        const vertexMessages = request.messages.map(msg => {
            // Handle content that could be a string or array of content blocks
            const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

            if (typeof msg.content === 'string') {
                parts.push({text: msg.content});
            } else {
                for (const block of msg.content) {
                    if (block.type === 'text') {
                        parts.push({text: block.text || ''});
                    } else if (block.type === 'image' && block.source?.type === 'base64') {
                        parts.push({
                            inlineData: {
                                mimeType: block.source.media_type,
                                data: block.source.data
                            }
                        });
                    }
                }
            }

            return {
                role: msg.role === 'user' ? 'user' : 'model', // Gemini uses 'user'/'model' instead of 'user'/'assistant'
                parts: parts
            };
        });

        const vertexRequest: any = {
            contents: vertexMessages,
            generationConfig: {
                // Map Anthropic temperature to Vertex
                ...(typeof request.temperature !== 'undefined' && {temperature: request.temperature}),
                // Map max_tokens to candidateCount and maxOutputTokens in Vertex
                ...(typeof request.max_tokens !== 'undefined' && {maxOutputTokens: request.max_tokens}),
                // Add stop sequences if provided
                ...(request.stop_sequences && request.stop_sequences.length > 0 && {stopSequences: request.stop_sequences})
            }
        };

        // Add system instructions if system prompt is provided
        if (request.system) {
            const systemContent = typeof request.system === 'string'
                ? request.system
                : request.system.map(block => block.text).join('\n');

            vertexRequest.systemInstruction = {
                role: 'system',
                parts: [{text: systemContent}]
            };
        }

        // Add safety settings (optional)
        vertexRequest.safetySettings = [
            {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_ONLY_HIGH'
            }
        ];

        return vertexRequest;
    }

    /**
     * Transforms Vertex Gemini API response format to Anthropic format
     */
    private transformToAnthropicFormat(vertexResponse: any, originalRequest: AnthropicMessageRequest): AnthropicMessageResponse {
        // Extract the first candidate from the response
        const candidate = vertexResponse.candidates?.[0];
        if (!candidate) {
            throw new Error('No candidates in Vertex response');
        }

        // Extract content parts
        const content = candidate.content.parts.map((part: any) => {
            if (part.text) {
                return {
                    type: 'text' as const,
                    text: part.text
                };
            } else if (part.functionCall) {
                // Map function calls to tool use
                return {
                    type: 'tool_use' as const,
                    id: `func_${Date.now()}`, // Generate a fake ID
                    name: part.functionCall.name,
                    input: part.functionCall.args
                };
            }
            return {
                type: 'text' as const,
                text: ''
            };
        });

        // Extract usage statistics
        const usageMetadata = vertexResponse.usageMetadata;

        // Map finish reason
        let stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | 'model_context_window_exceeded' | null = 'end_turn';
        if (candidate.finishReason) {
            switch (candidate.finishReason) {
                case 'STOP':
                    stopReason = 'end_turn';
                    break;
                case 'MAX_TOKENS':
                    stopReason = 'max_tokens';
                    break;
                case 'SAFETY':
                    stopReason = 'refusal';
                    break;
                case 'RECITATION':
                    stopReason = 'refusal';
                    break;
                case 'OTHER':
                    stopReason = 'end_turn';
                    break;
                default:
                    stopReason = 'end_turn';
            }
        }

        // Create the Anthropic response object
        return {
            id: `msg_${Date.now()}`, // Generate a fake ID
            type: 'message',
            role: 'assistant',
            content: content,
            model: this.config.model, // Use the configured model
            stop_reason: stopReason,
            stop_sequence: null, // Vertex doesn't provide stop sequence directly
            usage: {
                input_tokens: usageMetadata?.promptTokenCount || 0,
                output_tokens: usageMetadata?.candidatesTokenCount || 0
            }
        };
    }

    /**
     * Helper method to extract text from Vertex streaming response
     */
    private extractTextFromVertexResponse(response: any): string {
        const candidate = response.candidates?.[0];
        if (candidate && candidate.content?.parts) {
            const textParts = candidate.content.parts.filter((part: any) => part.text);
            return textParts.map((part: any) => part.text).join('');
        }
        return '';
    }
}