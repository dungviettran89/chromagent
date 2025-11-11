import {AnthropicMessageResponse} from "./AnthropicModel";

/**
 * Static class provide various utilities for Anthropic Models
 */
export class AnthropicUtils {
    /**
     * Check if the response is valid which has usage and content block
     * @param response
     */
     static isValidResponse(response:AnthropicMessageResponse):boolean{
        return !!(response && response.usage && response.content && response.content.length > 0);
    }
}