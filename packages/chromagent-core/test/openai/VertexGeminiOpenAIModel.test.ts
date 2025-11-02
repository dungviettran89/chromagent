import {expect} from 'chai';
import {VertexGeminiOpenAIModel} from '../../src/openai/VertexGeminiOpenAIModel';
import {OpenAIChatCompletionsRequest} from '../../src/openai/OpenAIModel';
import * as sinon from 'sinon';


describe('VertexGeminiOpenAIModel', () => {
    const mockConfig = {
        apiKey: 'test-api-key',
        model: 'gemini-pro',
        location: 'us-central1',
        project: 'test-project'
    };

    let vertexModel: VertexGeminiOpenAIModel;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        vertexModel = new VertexGeminiOpenAIModel(mockConfig);
        fetchStub = sinon.stub();
        (globalThis as any).fetch = fetchStub;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('constructor', () => {
        it('should initialize with the provided config', () => {
            expect(vertexModel).to.be.an.instanceOf(VertexGeminiOpenAIModel);
            expect((vertexModel as any).config).to.deep.equal(mockConfig);
        });
    });

    describe('message', () => {
        it('should transform OpenAI request to Vertex Gemini format and return response', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
                model: 'some-model',
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
                                {text: 'I am doing well, thank you for asking!'}
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 5,
                    candidatesTokenCount: 10
                }
            };

            // Set up the mock fetch response
            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            // Call the message method
            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            expect(callArgs[0]).to.include('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=test-api-key');
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

            // Verify the response is correctly transformed back to OpenAI format
            expect(result).to.deep.include({
                object: 'chat.completion',
                model: 'gemini-pro'
            });

            // Verify the usage
            expect(result).to.have.property('usage').that.deep.includes({
                prompt_tokens: 5,
                completion_tokens: 10,
                total_tokens: 15
            });

            // Check that the content is correct
            expect(result.choices[0]).to.deep.include({
                message: {
                    role: 'assistant',
                    content: 'I am doing well, thank you for asking!'
                },
                finish_reason: 'stop'
            });
        });

        it('should handle image content in requests', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
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
                                type: 'image_url',
                                image_url: {
                                    url: 'data:image/jpeg;base64,some_base64_encoded_data'
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
                                {text: 'I see a beautiful landscape'}
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 6,
                    candidatesTokenCount: 8
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Verify the image was properly converted
            expect(requestBody.contents[0].parts).to.deep.equal([
                {text: 'What do you see in this image?'},
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: 'some_base64_encoded_data'
                    }
                }
            ]);

            // Verify the response content
            expect(result.choices[0]).to.deep.include({
                message: {
                    role: 'assistant',
                    content: 'I see a beautiful landscape'
                }
            });
        });

        it('should handle tool definitions in requests', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Can you use the weather tool?'
                    }
                ],
                max_tokens: 100,
                tools: [
                    {
                        type: 'function',
                        function: {
                            name: 'get_weather',
                            description: 'Get the current weather in a given location',
                            parameters: {
                                type: 'object',
                                properties: {
                                    location: {
                                        type: 'string',
                                        description: 'The city and state, e.g. San Francisco, CA'
                                    }
                                },
                                required: ['location']
                            }
                        }
                    }
                ]
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    functionCall: {
                                        name: 'get_weather',
                                        args: {location: 'New York, NY'}
                                    }
                                }
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 7,
                    candidatesTokenCount: 12
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Verify that tools are properly included in the request
            expect(requestBody.tools).to.deep.equal([
                {
                    functionDeclarations: [
                        {
                            name: 'get_weather',
                            description: 'Get the current weather in a given location',
                            parameters: {
                                type: 'object',
                                properties: {
                                    location: {
                                        type: 'string',
                                        description: 'The city and state, e.g. San Francisco, CA'
                                    }
                                },
                                required: ['location']
                            }
                        }
                    ]
                }
            ]);

            // Check that tool usage is properly transformed
            expect(result.choices[0]).to.deep.include({
                message: {
                    role: 'assistant',
                    tool_calls: [
                        {
                            id: result.choices[0].message.tool_calls?.[0].id, // Generated ID
                            type: 'function',
                            function: {
                                name: 'get_weather',
                                arguments: '{"location":"New York, NY"}'
                            }
                        }
                    ]
                }
            });
        });

        it('should handle system messages correctly', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant.'
                    },
                    {
                        role: 'user',
                        content: 'Hello, how are you?'
                    }
                ],
                max_tokens: 100
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {text: 'I am a helpful assistant. How can I assist you today?'}
                            ]
                        },
                        finishReason: 'STOP'
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 5,
                    candidatesTokenCount: 10
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockVertexResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Verify that the system message was included as systemInstruction
            expect(requestBody.systemInstruction).to.deep.equal({
                role: 'system',
                parts: [
                    {text: 'You are a helpful assistant.'}
                ]
            });

            // Verify the user message is properly formatted
            expect(requestBody.contents).to.deep.equal([
                {
                    role: 'user',
                    parts: [
                        {text: 'Hello, how are you?'}
                    ]
                }
            ]);
        });

        it('should throw an error if Vertex API returns an error response', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
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
                await vertexModel.chatCompletion(mockOpenAIRequest);
                expect.fail('Expected an error to be thrown');
            } catch (error) {
                expect((error as Error).message).to.match(/Vertex API error: 500/);
            }
        });
    });
});