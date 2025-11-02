import {expect} from 'chai';
import 'dotenv/config';
import {VertexGeminiOpenAIModel} from '../../src/openai/VertexGeminiOpenAIModel';

// If integration tests fail due to model not found, please web search for the latest
// available Google Gemini model names. Model names may change over time as new 
// versions are released. Check the official Gemini API documentation for the latest models.

describe('VertexGeminiOpenAIModel Integration Tests', function () {
    this.timeout(30000); // Set timeout to 30 seconds for integration tests
    let vertexModel: VertexGeminiOpenAIModel | null = null;

    // Check if API key is provided before running tests
    before(function () {
        if (!process.env.VERTEX_GEMINI_API_KEY) {
            console.log('Skipping VertexGeminiOpenAIModel integration tests - no API key provided');
            console.log('To run these tests, add your API key to a .env file as: VERTEX_GEMINI_API_KEY=your_key');
            this.skip();
            return;
        }

        const config = {
            apiKey: process.env.VERTEX_GEMINI_API_KEY!,
            model: 'gemini-2.5-flash-lite-preview-09-2025', // Using the specified model
            // If integration test fails due to model not found, 
            // please websearch for the latest available Gemini lite model
            // Commonly available models can be found at:
            // https://ai.google.dev/gemini-api/docs/models/gemini
            location: process.env.VERTEX_LOCATION || 'us-central1',
            project: process.env.VERTEX_PROJECT_ID || 'your-project-id'
        };

        vertexModel = new VertexGeminiOpenAIModel(config);
    });

    it('should successfully send a message and receive a response', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request = {
            model: 'gemini-1.5-flash-001', // This will be ignored in favor of the configured model
            messages: [
                {
                    role: 'user',
                    content: 'Hello, test this integration'
                }
            ],
            max_tokens: 100,
            temperature: 0.7
        };

        const response = await vertexModel!.chatCompletion(request);

        // Basic checks to ensure response is properly formatted (OpenAI format)
        expect(response).to.have.property('id');
        expect(response).to.have.property('object').that.equals('chat.completion');
        expect(response).to.have.property('choices').that.is.an('array');
        expect(response.choices[0]).to.have.property('message').that.has.property('role').that.equals('assistant');
        expect(response.choices[0].message).to.have.property('content');
        expect(response).to.have.property('model', 'gemini-2.5-flash-lite-preview-09-2025');
        // If this assertion fails because the model name changed, 
        // search for the latest model name and update both the config and this assertion
        expect(response).to.have.property('usage').that.has.property('prompt_tokens');
        expect(response).to.have.property('usage').that.has.property('completion_tokens');
        expect(response).to.have.property('usage').that.has.property('total_tokens');

        // Check that content is not null and has some text
        expect(response.choices[0].message.content).to.not.be.null;
        expect(response.choices[0].message.content).to.be.a('string');
        expect(response.choices[0].message.content).to.have.length.greaterThan(0);
    });

    it('should handle a request with higher token count', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request = {
            model: 'gemini-1.5-flash-001',
            messages: [
                {
                    role: 'user',
                    content: 'Write a short poem about programming'
                }
            ],
            max_tokens: 200,
            temperature: 0.8
        };

        const response = await vertexModel!.chatCompletion(request);

        expect(response).to.have.property('id');
        expect(response).to.have.property('choices').that.is.an('array');
        expect(response.choices[0].message.content).to.not.be.null;
        expect(response.choices[0].message.content).to.be.a('string');
        expect(response.choices[0].message.content).to.have.length.greaterThan(0);
    });

    it('should handle a request with system prompt', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request = {
            model: 'gemini-1.5-flash-001',
            messages: [
                {
                    role: 'user',
                    content: 'What is the capital of France?'
                }
            ],
            max_tokens: 100,
            temperature: 0.5,
            system: 'You are a helpful geography assistant. Always be concise and accurate.'
        };

        const response = await vertexModel!.chatCompletion(request);

        expect(response).to.have.property('id');
        expect(response).to.have.property('choices').that.is.an('array');
        expect(response.choices[0].message.content).to.not.be.null;
        expect(response.choices[0].message.content).to.be.a('string');
        expect(response.choices[0].message.content).to.include('Paris');
    });

    it('should handle tool calls correctly', async function () {
        if (!vertexModel) {
            this.skip(); // Skip test if Vertex API is not available
        }

        const request = {
            model: 'gemini-1.5-flash-001',
            messages: [
                {
                    role: 'user',
                    content: 'What is the weather like in San Francisco?'
                }
            ],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'get_current_weather',
                        description: 'Get the current weather in a given location',
                        parameters: {
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
                }
            ],
            tool_choice: 'auto',
            max_tokens: 150
        };

        const response = await vertexModel!.chatCompletion(request);

        expect(response).to.have.property('id');
        expect(response).to.have.property('choices').that.is.an('array');
        expect(response.choices[0]).to.have.property('message');

        // When tool calls are present, content should be null in OpenAI format
        if (response.choices[0].message.tool_calls && response.choices[0].message.tool_calls.length > 0) {
            expect(response.choices[0].message.content).to.be.null;
            expect(response.choices[0].message.tool_calls).to.be.an('array');
            expect(response.choices[0].message.tool_calls[0]).to.have.property('function');
            expect(response.choices[0].message.tool_calls[0].function).to.have.property('name').that.is.a('string');
            expect(response.choices[0].message.tool_calls[0].function).to.have.property('arguments').that.is.a('string');
        } else {
            // If no tool calls were made, content should have a value
            expect(response.choices[0].message.content).to.not.be.null;
            expect(response.choices[0].message.content).to.be.a('string');
        }
    });
});