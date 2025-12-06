import { expect } from 'chai';
import 'dotenv/config';
import { VertexGeminiOpenAIModel } from '../../src/openai/VertexGeminiOpenAIModel';
import { OpenAIChatCompletionsRequest } from '../../src/openai/OpenAIModel';

describe('VertexGeminiOpenAIModel Integration Tests', () => {
    let vertexModel: VertexGeminiOpenAIModel | null = null;

    before(function () {
        if (!process.env.VERTEX_GEMINI_API_KEY) {
            console.log('Skipping VertexGeminiOpenAIModel integration tests - no API key provided');
            this.skip();
            return;
        }

        const config = {
            apiKey: process.env.VERTEX_GEMINI_API_KEY!,
            model: 'gemini-1.5-flash-001',
            location: process.env.VERTEX_LOCATION || 'us-central1',
            project: process.env.VERTEX_PROJECT_ID || 'your-project-id'
        };

        vertexModel = new VertexGeminiOpenAIModel(config);
    });

    it('should successfully send a message and receive a response', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request: OpenAIChatCompletionsRequest = {
            model: 'gemini-1.5-flash-001',
            messages: [
                { role: 'user', content: 'Hello, test this integration' }
            ],
            max_tokens: 100,
            temperature: 0.7
        };

        const result = await vertexModel!.chatCompletion(request);

        // Check response structure
        expect(result).to.have.property('id');
        expect(result).to.have.property('object', 'chat.completion');
        expect(result).to.have.property('choices').that.is.an('array');
        expect((result as any).choices).to.have.length.greaterThan(0);

        const choice = (result as any).choices[0];
        expect(choice).to.have.property('message');
        expect(choice.message).to.have.property('role', 'assistant');
        expect(choice.message).to.have.property('content').that.is.a('string');
        expect(choice.message.content).to.have.length.greaterThan(0);
    });

    it('should handle system prompt', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request: OpenAIChatCompletionsRequest = {
            model: 'gemini-1.5-flash-001',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that speaks like a pirate.' },
                { role: 'user', content: 'Say hello' }
            ],
            max_tokens: 100
        };

        const result = await vertexModel!.chatCompletion(request);
        const choice = (result as any).choices[0];
        expect(choice.message.content.toLowerCase()).to.contain('ahoy');
    });

    it('should handle streaming response', async function () {
        if (!vertexModel) {
            this.skip();
        }

        const request: OpenAIChatCompletionsRequest = {
            model: 'gemini-1.5-flash-001',
            messages: [
                { role: 'user', content: 'Count to 5' }
            ],
            stream: true
        };

        const result = await vertexModel!.chatCompletion(request);

        // Verify it returns an async iterable
        expect(Symbol.asyncIterator in result).to.be.true;

        let content = '';
        for await (const chunk of (result as AsyncIterable<any>)) {
            expect(chunk).to.have.property('object', 'chat.completion.chunk');
            if (chunk.choices[0].delta.content) {
                content += chunk.choices[0].delta.content;
            }
        }

        expect(content).to.have.length.greaterThan(0);
        expect(content).to.contain('1');
        expect(content).to.contain('5');
    });
});