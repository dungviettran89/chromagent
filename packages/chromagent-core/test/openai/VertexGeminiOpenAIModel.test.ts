import { expect } from 'chai';
import * as sinon from 'sinon';
import { VertexGeminiOpenAIModel } from '../../src/openai/VertexGeminiOpenAIModel';
import { OpenAIChatCompletionsRequest } from '../../src/openai/OpenAIModel';

describe('VertexGeminiOpenAIModel', () => {
    let sandbox: sinon.SinonSandbox;
    let fetchStub: sinon.SinonStub;
    let model: VertexGeminiOpenAIModel;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        fetchStub = sandbox.stub(global, 'fetch');
        model = new VertexGeminiOpenAIModel({
            apiKey: 'test-key',
            model: 'gemini-pro'
        });
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should transform basic chat request correctly', async () => {
        const request: OpenAIChatCompletionsRequest = {
            model: 'gemini-pro',
            messages: [
                { role: 'system', content: 'You are a helper.' },
                { role: 'user', content: 'Hello' }
            ],
            temperature: 0.7,
            max_tokens: 100
        };

        fetchStub.resolves({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: { parts: [{ text: 'Hi there!' }] },
                    finishReason: 'STOP',
                    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
                }]
            })
        } as any);

        await model.chatCompletion(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.contents).to.have.lengthOf(1);
        expect(body.contents[0].role).to.equal('user');
        expect(body.contents[0].parts[0].text).to.equal('Hello');

        expect(body.systemInstruction).to.exist;
        expect(body.systemInstruction.parts[0].text).to.equal('You are a helper.');

        expect(body.generationConfig.temperature).to.equal(0.7);
        expect(body.generationConfig.maxOutputTokens).to.equal(100);
    });

    it('should merge consecutive messages of same role', async () => {
        const request: OpenAIChatCompletionsRequest = {
            model: 'gemini-pro',
            messages: [
                { role: 'user', content: 'Hello' },
                { role: 'user', content: 'World' }
            ]
        };

        fetchStub.resolves({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: { parts: [{ text: 'response' }] },
                    finishReason: 'STOP'
                }]
            })
        } as any);

        await model.chatCompletion(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.contents).to.have.lengthOf(1);
        expect(body.contents[0].role).to.equal('user');
        expect(body.contents[0].parts).to.have.lengthOf(2);
        expect(body.contents[0].parts[0].text).to.equal('Hello');
        expect(body.contents[0].parts[1].text).to.equal('World');
    });

    it('should transform tools and clean schema', async () => {
        const request: OpenAIChatCompletionsRequest = {
            model: 'gemini-pro',
            messages: [{ role: 'user', content: 'call tool' }],
            tools: [{
                type: 'function',
                function: {
                    name: 'test_tool',
                    description: 'A test tool',
                    parameters: {
                        type: 'object',
                        properties: {
                            param: { type: 'string' }
                        },
                        $schema: 'http://json-schema.org/draft-07/schema#'
                    } as any
                }
            }]
        };

        fetchStub.resolves({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: { parts: [{ text: 'response' }] },
                    finishReason: 'STOP'
                }]
            })
        } as any);

        await model.chatCompletion(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.tools).to.have.lengthOf(1);
        expect(body.tools[0].functionDeclarations[0].name).to.equal('test_tool');
        expect(body.tools[0].functionDeclarations[0].parameters).to.not.have.property('$schema');
    });

    it('should handle tool choice', async () => {
        const request: OpenAIChatCompletionsRequest = {
            model: 'gemini-pro',
            messages: [{ role: 'user', content: 'call tool' }],
            tools: [{
                type: 'function',
                function: { name: 'test_tool', parameters: { type: 'object', properties: {} } }
            }],
            tool_choice: { type: 'function', function: { name: 'test_tool' } }
        };

        fetchStub.resolves({
            ok: true,
            json: async () => ({
                candidates: [{
                    content: { parts: [{ text: 'response' }] },
                    finishReason: 'STOP'
                }]
            })
        } as any);

        await model.chatCompletion(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.toolConfig).to.exist;
        expect(body.toolConfig.functionCallingConfig.mode).to.equal('ANY');
        expect(body.toolConfig.functionCallingConfig.allowedFunctionNames).to.deep.equal(['test_tool']);
    });
});