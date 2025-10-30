import {expect} from 'chai';
import 'dotenv/config';
import {VertexGeminiAnthropicModel} from '../../src/anthropic/VertexGeminiAnthropicModel';
import {AnthropicMessageRequest} from '../../src/anthropic/AnthropicModel';

// If integration tests fail due to model not found, please web search for the latest
// available Google Gemini model names. Model names may change over time as new 
// versions are released. Check the official Gemini API documentation for the latest models.

describe('VertexGeminiAnthropicModel Integration Tests', () => {
    let vertexModel: VertexGeminiAnthropicModel | null = null;

    // Check if API key is provided before running tests
    before(function () {
        if (!process.env.VERTEX_GEMINI_API_KEY) {
            console.log('Skipping VertexGeminiAnthropicModel integration tests - no API key provided');
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

        vertexModel = new VertexGeminiAnthropicModel(config);
    });

    it('should successfully send a message and receive a response', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request: AnthropicMessageRequest = {
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

        const result = await vertexModel!.message(request);

        // Basic checks to ensure response is properly formatted
        expect(result).to.have.property('id');
        expect(result).to.have.property('type', 'message');
        expect(result).to.have.property('role', 'assistant');
        expect(result).to.have.property('model', 'gemini-2.5-flash-lite-preview-09-2025');
        // If this assertion fails because the model name changed, 
        // search for the latest model name and update both the config and this assertion
        expect(result).to.have.property('content').that.is.an('array');
        expect(result).to.have.property('stop_reason');
        expect(result).to.have.property('usage').that.has.property('input_tokens');
        expect(result).to.have.property('usage').that.has.property('output_tokens');

        // Check that content array has at least one item
        expect(result.content).to.have.length.greaterThan(0);

        // Check that the first content item is text
        const firstContent = result.content[0];
        expect(firstContent).to.have.property('type', 'text');
        expect(firstContent).to.have.property('text').that.is.a('string');
    });

    it('should handle a request with higher token count', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request: AnthropicMessageRequest = {
            model: 'claude-3-haiku-20240307',
            messages: [
                {
                    role: 'user',
                    content: 'Write a short poem about programming'
                }
            ],
            max_tokens: 200,
            temperature: 0.8
        };

        const result = await vertexModel!.message(request);

        expect(result).to.have.property('id');
        expect(result).to.have.property('content').that.is.an('array');
        expect(result.content).to.have.length.greaterThan(0);

        const firstContent = result.content[0];
        expect(firstContent).to.have.property('type', 'text');
        expect(firstContent).to.have.property('text').that.is.a('string');
        expect(firstContent.text).to.have.length.greaterThan(0);
    });

    it('should handle a request with system prompt', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request: AnthropicMessageRequest = {
            model: 'claude-3-haiku-20240307',
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

        const result = await vertexModel!.message(request);

        expect(result).to.have.property('id');
        expect(result).to.have.property('content').that.is.an('array');
        expect(result.content).to.have.length.greaterThan(0);

        const firstContent = result.content[0];
        expect(firstContent).to.have.property('type', 'text');
        expect(firstContent).to.have.property('text').that.is.a('string');
        expect(firstContent.text).to.contain('Paris');
    });
});