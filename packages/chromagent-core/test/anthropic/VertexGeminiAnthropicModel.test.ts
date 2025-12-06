import { expect } from 'chai';
import * as sinon from 'sinon';
import { VertexGeminiAnthropicModel } from '../../src/anthropic/VertexGeminiAnthropicModel';
import { AnthropicMessageRequest } from '../../src/anthropic/AnthropicModel';

describe('VertexGeminiAnthropicModel', () => {
    let fetchStub: sinon.SinonStub;
    let model: VertexGeminiAnthropicModel;

    beforeEach(() => {
        fetchStub = sinon.stub(global, 'fetch');
        model = new VertexGeminiAnthropicModel({
            apiKey: 'test-key',
            model: 'gemini-pro'
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should transform WebSearch tool correctly', async () => {
        const request: AnthropicMessageRequest = {
            model: 'gemini-pro',
            messages: [{ role: 'user', content: 'search for something' }],
            max_tokens: 100,
            tools: [{
                name: 'WebSearch',
                description: 'Search the web',
                input_schema: { type: 'object', properties: {} }
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

        await model.message(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.tools).to.have.lengthOf(1);
        expect(body.tools[0]).to.have.property('googleSearchRetrieval');
    });

    it('should transform WebFetch tool correctly', async () => {
        const request: AnthropicMessageRequest = {
            model: 'gemini-pro',
            messages: [{ role: 'user', content: 'fetch url' }],
            max_tokens: 100,
            tools: [{
                name: 'WebFetch',
                description: 'Fetch a URL',
                input_schema: { type: 'object', properties: {} }
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

        await model.message(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.tools).to.have.lengthOf(1);
        expect(body.tools[0]).to.have.property('urlContext');
    });

    it('should clean JSON schema parameters', async () => {
        const request: AnthropicMessageRequest = {
            model: 'gemini-pro',
            messages: [{ role: 'user', content: 'call tool' }],
            max_tokens: 100,
            tools: [{
                name: 'custom_tool',
                description: 'A custom tool',
                input_schema: {
                    type: 'object',
                    properties: {
                        param: { type: 'string', description: 'param' }
                    },
                    $schema: 'http://json-schema.org/draft-07/schema#'
                } as any
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

        await model.message(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.tools).to.have.lengthOf(1);
        expect(body.tools[0].functionDeclarations[0].parameters).to.not.have.property('$schema');
    });

    it('should handle thinking blocks', async () => {
        const request: AnthropicMessageRequest = {
            model: 'gemini-pro',
            messages: [{
                role: 'user',
                content: [
                    { type: 'thinking', thinking: 'I should think about this' },
                    { type: 'text', text: 'Hello' }
                ] as any
            }],
            max_tokens: 100
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

        await model.message(request);

        const call = fetchStub.getCall(0);
        const body = JSON.parse(call.args[1].body);

        expect(body.contents[0].parts).to.have.lengthOf(2);
        expect(body.contents[0].parts[0]).to.deep.equal({ text: 'I should think about this' });
        expect(body.contents[0].parts[1]).to.deep.equal({ text: 'Hello' });
    });
});