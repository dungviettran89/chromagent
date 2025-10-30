import {expect} from 'chai';
import {VertexGeminiAnthropicModel} from '../../src/anthropic/VertexGeminiAnthropicModel';
import {AnthropicMessageRequest} from '../../src/anthropic/AnthropicModel';
import * as sinon from 'sinon';

describe('VertexGeminiAnthropicModel', () => {
    const mockConfig = {
        apiKey: 'test-api-key',
        model: 'gemini-pro',
        location: 'us-central1',
        project: 'test-project'
    };

    let vertexModel: VertexGeminiAnthropicModel;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        vertexModel = new VertexGeminiAnthropicModel(mockConfig);
        fetchStub = sinon.stub();
        (globalThis as any).fetch = fetchStub;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('constructor', () => {
        it('should initialize with the provided config', () => {
            expect(vertexModel).to.be.an.instanceOf(VertexGeminiAnthropicModel);
            expect((vertexModel as any).config).to.deep.equal(mockConfig);
        });
    });

    describe('message', () => {
        it('should transform Anthropic request to Vertex Gemini format and return response', async () => {
            // Define the expected request and response
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model', // This will be ignored in favor of the configured model
                messages: [
                    {
                        role: 'user',
                        content: 'Hello, how are you?'
                    }
                ],
                max_tokens: 100,
                temperature: 0.7
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'I am doing well, thank you for asking!'
                                }
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 15
                }
            };

            // Set up the mock fetch response
            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            // Call the message method
            const result = await vertexModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            expect(callArgs[0]).to.equal('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=test-api-key');
            expect(callArgs[1].method).to.equal('POST');
            expect(callArgs[1].headers['Content-Type']).to.equal('application/json');

            // Parse the body to check its structure
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.contents).to.deep.equal([
                {
                    role: 'user',
                    parts: [
                        {text: 'Hello, how are you?'}
                    ]
                }
            ]);
            expect(requestBody.generationConfig).to.deep.equal({
                temperature: 0.7,
                maxOutputTokens: 100
            });
            expect(requestBody.safetySettings).to.deep.equal([
                {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    threshold: 'BLOCK_ONLY_HIGH'
                }
            ]);

            // Verify the response is correctly transformed back to Anthropic format
            expect(result).to.deep.include({
                type: 'message',
                role: 'assistant',
                model: 'gemini-pro', // Using configured model
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 10,
                    output_tokens: 15
                }
            });

            // Check that the content is correct
            expect(result.content[0]).to.deep.equal({
                type: 'text',
                text: 'I am doing well, thank you for asking!'
            });
        });

        it('should handle image content in requests', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'What do you see in this image?'
                            },
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/jpeg',
                                    data: 'some_base64_encoded_data'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 100
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'I see a beautiful landscape'
                                }
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 12,
                    candidatesTokenCount: 8
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await vertexModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.contents[0]).to.deep.equal({
                role: 'user',
                parts: [
                    {text: 'What do you see in this image?'},
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: 'some_base64_encoded_data'
                        }
                    }
                ]
            });

            // Verify the response content
            expect(result.content[0]).to.deep.equal({
                type: 'text',
                text: 'I see a beautiful landscape'
            });
        });

        it('should handle system prompt in requests', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 100,
                system: 'You are a helpful assistant'
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'Hello! How can I assist you today?'
                                }
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 8,
                    candidatesTokenCount: 10
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await vertexModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Check that system instruction is included
            expect(requestBody.systemInstruction).to.deep.equal({
                role: 'system',
                parts: [
                    {text: 'You are a helpful assistant'}
                ]
            });

            // Verify the response content
            expect(result.content[0]).to.deep.equal({
                type: 'text',
                text: 'Hello! How can I assist you today?'
            });
        });

        it('should handle stop sequences in requests', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Count to 10'
                    }
                ],
                max_tokens: 100,
                stop_sequences: ['5', 'STOP_HERE']
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: '1 2 3 4 5'
                                }
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 6,
                    candidatesTokenCount: 5
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await vertexModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Check that stop sequences are included in generation config
            expect(requestBody.generationConfig.stopSequences).to.deep.equal(['5', 'STOP_HERE']);

            // Verify the response content
            expect(result.content[0]).to.deep.equal({
                type: 'text',
                text: '1 2 3 4 5'
            });
        });

        it('should handle tool usage in responses', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Can you call a tool?'
                    }
                ],
                max_tokens: 100
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    functionCall: {
                                        name: 'get_weather',
                                        args: {location: 'New York'}
                                    }
                                }
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 8,
                    candidatesTokenCount: 12
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await vertexModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;

            // Check that tool usage is properly transformed
            const toolUseBlock = result.content.find(block => block.type === 'tool_use');
            expect(toolUseBlock).to.deep.include({
                type: 'tool_use',
                name: 'get_weather',
                input: {location: 'New York'}
            });
            expect(toolUseBlock).to.have.property('id').that.is.a('string');
        });

        it('should map different finish reasons correctly', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 100
            };

            // Test different finish reasons
            const finishReasonTests = [
                {vertexReason: 'STOP', anthropicReason: 'end_turn'},
                {vertexReason: 'MAX_TOKENS', anthropicReason: 'max_tokens'},
                {vertexReason: 'SAFETY', anthropicReason: 'refusal'},
                {vertexReason: 'RECITATION', anthropicReason: 'refusal'},
                {vertexReason: 'OTHER', anthropicReason: 'end_turn'}
            ];

            for (const test of finishReasonTests) {
                const mockVertexResponse = {
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: 'Test response'
                                    }
                                ]
                            },
                            finishReason: test.vertexReason
                        }
                    ],
                    usageMetadata: {
                        promptTokenCount: 5,
                        candidatesTokenCount: 7
                    }
                };

                const mockFetchResponse = {
                    ok: true,
                    json: () => Promise.resolve(mockVertexResponse)
                };

                fetchStub.resolves(mockFetchResponse);

                const result = await vertexModel.message(mockAnthropicRequest);

                expect(result.stop_reason).to.equal(test.anthropicReason);
            }
        });

        it('should throw an error if Vertex API returns an error response', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 100
            };

            const mockFetchResponse = {
                ok: false,
                status: 500,
                text: () => Promise.resolve('Internal Server Error')
            };

            fetchStub.resolves(mockFetchResponse);

            try {
                await vertexModel.message(mockAnthropicRequest);
                expect.fail('Expected an error to be thrown');
            } catch (error) {
                expect((error as Error).message).to.match(/Vertex API error: 500/);
            }
        });

        it('should use default location and project if not provided', async () => {
            // Create model without location and project
            const defaultModel = new VertexGeminiAnthropicModel({
                apiKey: 'test-api-key',
                model: 'gemini-pro'
            });

            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 100
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'Response'
                                }
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 3,
                    candidatesTokenCount: 5
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            await defaultModel.message(mockAnthropicRequest);

            // Verify the fetch was called with the default location
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            expect(callArgs[0]).to.equal('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=test-api-key');
        });
    });
});