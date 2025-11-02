/**
 * Related docs: https://platform.openai.com/docs/api-reference/chat/create
 * Contains minimal fields for the following functions only:
 * - Image
 * - Tool Call
 * - Temperature config
 * - token usage data
 */

export interface OpenAIChatCompletionsRequest {
    /** The model that will complete your prompt */
    model: string;

    /** Input messages. Each input message must be an object with a `role` and `content` */
    messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string | Array<{
            type: 'text' | 'image_url';
            text?: string;
            image_url?: {
                url: string;
                detail?: 'auto' | 'low' | 'high';
            };
        }>;
    }>;

    /** What sampling temperature to use, between 0 and 2 */
    temperature?: number;

    /** Up to 4 sequences where the API will stop generating further tokens */
    stop?: string | Array<string>;

    /** Number of tokens to generate */
    max_tokens?: number;

    /** Whether to return log probabilities of the output tokens or not */
    logprobs?: boolean;

    /** An integer between 0 and 5 specifying the number of most likely tokens to return at each token position */
    top_logprobs?: number;

    /** A list of functions the model may generate JSON inputs for */
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters: {
                type: 'object';
                properties: Record<string, any>;
                required?: string[];
            };
        };
    }>;

    /** Controls which (if any) function is called by the model */
    tool_choice?: 'none' | 'auto' | 'required' | {
        type: 'function';
        function: {
            name: string;
        };
    };

    /** A unique identifier representing your end-user */
    user?: string;

    /** How many chat completion choices to generate for each input message */
    n?: number;

    /** Modifies the likelihood of specified tokens appearing in the completion */
    logit_bias?: Record<string, number>;

    /** The maximum number of tokens to generate in the completion */
    max_completion_tokens?: number;

    /** Presence penalty to the generation */
    presence_penalty?: number;

    /** Frequency penalty to the generation */
    frequency_penalty?: number;

    /** Number between -2.0 and 2.0 where positive values penalize new tokens based on their existing frequency */
    repetition_penalty?: number;

    /** If set, partial message deltas will be sent */
    stream?: boolean;

    /** What sampling temperature to use for nucleus sampling */
    top_p?: number;
}

export interface OpenAIChatCompletionsResponse {
    /** Unique identifier for the chat completion */
    id: string;

    /** A list of chat completion choices */
    choices: Array<{
        /** The index of this choice */
        index: number;
        /** The message content */
        message: {
            role: 'assistant';
            content: string | null;
            tool_calls?: Array<{
                id: string;
                type: 'function';
                function: {
                    name: string;
                    arguments: string;
                };
            }>;
        };
        /** The reason the model stopped generating tokens */
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call';
        /** Log probability information for the choice */
        logprobs: any; // Detailed structure can vary
    }>;

    /** The model used for the completion */
    model: string;

    /** Object type, for chat completions it's always 'chat.completion' */
    object: 'chat.completion';

    /** Usage statistics for the completion request */
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };

    /** Unix timestamp of when the chat completion was created */
    created: number;
}

/**
 * Related docs: https://platform.openai.com/docs/api-reference/chat/create
 * Contains only one method to allow mapping back to OpenAI compatible API
 */
export interface OpenAIModel {
    /**
     * Sends a message to the OpenAI API and returns a complete response.
     *
     * @param request - The message request containing model, messages, and other configuration
     * @returns A promise that resolves to the API response with content, model info, and usage statistics
     */
    chatCompletion(request: OpenAIChatCompletionsRequest): Promise<OpenAIChatCompletionsResponse>
}