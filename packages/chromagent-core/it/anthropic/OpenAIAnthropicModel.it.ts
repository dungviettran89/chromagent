import {expect} from 'chai';
import 'dotenv/config';
import {OpenAIAnthropicModel} from '../../src/anthropic/OpenAIAnthropicModel';

// Using environment variables for OpenAI-compatible API
// OPENAI_COMPATIBLE_URL=https://openrouter.ai/api/v1
// OPENAI_COMPATIBLE_API_KEY=your-api-key
// OPENAI_COMPATIBLE_MODEL=your-model-name
describe('OpenAIAnthropicModel Integration Tests', function () {
    this.timeout(30000); // Set timeout to 30 seconds for integration tests

    let openAIModel: OpenAIAnthropicModel | null = null;
    let openAIEndpointAvailable = false;

    before(async function () {
        // Check if OPENAI_COMPATIBLE_URL, OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_MODEL are provided before running tests
        if (!process.env.OPENAI_COMPATIBLE_URL || !process.env.OPENAI_COMPATIBLE_API_KEY || !process.env.OPENAI_COMPATIBLE_MODEL) {
            console.log('OPENAI_COMPATIBLE_URL, OPENAI_COMPATIBLE_API_KEY or OPENAI_COMPATIBLE_MODEL not provided in environment variables');
            console.log('To run these tests, add them to a .env file as: OPENAI_COMPATIBLE_URL=url, OPENAI_COMPATIBLE_API_KEY=key and OPENAI_COMPATIBLE_MODEL=model_name');
            this.skip();
            return;
        }

        try {
            openAIModel = new OpenAIAnthropicModel({
                url: process.env.OPENAI_COMPATIBLE_URL!,
                apiKey: process.env.OPENAI_COMPATIBLE_API_KEY!,
                model: process.env.OPENAI_COMPATIBLE_MODEL!
            });

            // Try to make a simple request to see if the OpenAI-compatible endpoint is available
            const testRequest = {
                model: process.env.OPENAI_COMPATIBLE_MODEL!,
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 10
            };

            await openAIModel.message(testRequest);
            openAIEndpointAvailable = true;
        } catch (error) {
            console.log('OpenAI-compatible endpoint not available for integration tests. Skipping tests.');
            this.skip();
            return;
        }
    });

    it('should successfully send a message and receive a response', async function () {
        if (!openAIEndpointAvailable) {
            this.skip(); // Skip test if OpenAI-compatible endpoint is not available
        }

        const request = {
            model: process.env.OPENAI_COMPATIBLE_MODEL!, // This will be ignored, using configured model
            messages: [
                {
                    role: 'user',
                    content: 'Hello, how are you?'
                }
            ],
            max_tokens: 100
        };

        const response = await openAIModel!.message(request);

        expect(response).to.have.property('id');
        expect(response).to.have.property('type').that.equals('message');
        expect(response).to.have.property('role').that.equals('assistant');
        expect(response).to.have.property('content').that.is.an('array');
        expect(response).to.have.property('model').that.includes(process.env.OPENAI_COMPATIBLE_MODEL!);
        expect(response).to.have.property('usage').that.has.property('input_tokens');
        expect(response).to.have.property('usage').that.has.property('output_tokens');
    });

    it('should handle image input correctly', async function () {
        if (!openAIEndpointAvailable) {
            this.skip(); // Skip test if OpenAI-compatible endpoint is not available
        }

        // Using a placeholder image base64 string - in real integration tests,
        // you would have a real image to test with
        const request = {
            model: process.env.OPENAI_COMPATIBLE_MODEL!,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Describe this image:'
                        },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/jpeg',
                                data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' // 1x1 pixel image
                            }
                        }
                    ]
                }
            ],
            max_tokens: 150
        };

        try {
            const response = await openAIModel!.message(request);

            expect(response).to.have.property('id');
            expect(response).to.have.property('content').that.is.an('array');
        } catch (error) {
            // Some models don't support image inputs, so we'll handle this gracefully
            if (error instanceof Error && error.message.includes('this model is missing data required for image input')) {
                // This is an expected error for models that don't support images
                // We'll skip this test but mark it as passed rather than failed
                console.log('Model does not support image input - test skipped');
                this.skip();
            } else {
                // Re-throw other errors
                throw error;
            }
        }
    });

    it('should handle temperature parameter correctly', async function () {
        if (!openAIEndpointAvailable) {
            this.skip(); // Skip test if OpenAI-compatible endpoint is not available
        }

        const request = {
            model: process.env.OPENAI_COMPATIBLE_MODEL!,
            messages: [
                {
                    role: 'user',
                    content: 'Count from 1 to 10.'
                }
            ],
            max_tokens: 100,
            temperature: 0.7
        };

        const response = await openAIModel!.message(request);

        expect(response).to.have.property('id');
        expect(response).to.have.property('content').that.is.an('array');
    });

    it('should handle system prompt correctly', async function () {
        if (!openAIEndpointAvailable) {
            this.skip(); // Skip test if OpenAI-compatible endpoint is not available
        }

        const request = {
            model: process.env.OPENAI_COMPATIBLE_MODEL!,
            system: 'You are a helpful assistant.',
            messages: [
                {
                    role: 'user',
                    content: 'Hello, who are you?'
                }
            ],
            max_tokens: 100
        };

        const response = await openAIModel!.message(request);

        expect(response).to.have.property('id');
        expect(response).to.have.property('content').that.is.an('array');
    });

    it('should handle tool usage correctly', async function () {
        if (!openAIEndpointAvailable) {
            this.skip(); // Skip test if OpenAI-compatible endpoint is not available
        }

        const request = {
            model: process.env.OPENAI_COMPATIBLE_MODEL!,
            messages: [
                {
                    role: 'user',
                    content: 'What is the weather like in New York?'
                }
            ],
            max_tokens: 150,
            tools: [
                {
                    name: 'get_current_weather',
                    description: 'Get the current weather in a given location',
                    input_schema: {
                        type: 'object',
                        properties: {
                            location: {
                                type: 'string',
                                description: 'The city and state, e.g. San Francisco, CA'
                            },
                            unit: {
                                type: 'string',
                                enum: ['celsius', 'fahrenheit']
                            }
                        },
                        required: ['location']
                    }
                }
            ],
            tool_choice: {
                type: 'tool',
                name: 'get_current_weather'
            }
        };

        const response = await openAIModel!.message(request);

        expect(response).to.have.property('id');
        expect(response).to.have.property('content').that.is.an('array');
        // Response might contain either text or tool_use content blocks
        // If it contains tool use, verify the structure
        const toolUseBlock = response.content.find(block => block.type === 'tool_use');
        if (toolUseBlock) {
            expect(toolUseBlock).to.have.property('name');
            expect(toolUseBlock).to.have.property('input');
        }
    });
});