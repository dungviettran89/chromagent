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

    describe('chatCompletion', () => {
        it('should transform OpenAI request to Vertex Gemini format and return response', async () => {
            // Define the expected request and response
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
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

            // Call the chatCompletion method
            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

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

            // Verify the response is correctly transformed back to OpenAI format
            expect(result).to.deep.include({
                id: result.id, // Any ID should match
                model: 'gemini-pro', // Using configured model
                object: 'chat.completion',
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 15,
                    total_tokens: 25
                }
            });

            // Check that the content is correct
            expect(result.choices[0].message.content).to.equal('I am doing well, thank you for asking!');
            expect(result.choices[0].finish_reason).to.equal('stop');
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

            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

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
            expect(result.choices[0].message.content).to.equal('I see a beautiful landscape');
        });

        it('should handle system prompt in requests', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant'
                    },
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

            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

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
            expect(result.choices[0].message.content).to.equal('Hello! How can I assist you today?');
        });

        it('should handle stop sequences in requests', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Count to 10'
                    }
                ],
                max_tokens: 100,
                stop: ['5', 'STOP_HERE']
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

            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Check that stop sequences are included in generation config
            expect(requestBody.generationConfig.stopSequences).to.deep.equal(['5', 'STOP_HERE']);

            // Verify the response content
            expect(result.choices[0].message.content).to.equal('1 2 3 4 5');
        });

        it('should handle tool usage in responses', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Can you call a tool?'
                    }
                ],
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

            const result = await vertexModel.chatCompletion(mockOpenAIRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;

            // Check that tools are included in the request
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);
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

            // Check that tool usage is properly transformed in the response
            expect(result.choices[0].message.content).to.be.null; // Content should be null when there are tool calls
            expect(result.choices[0].message.tool_calls).to.deep.equal([
                {
                    id: result.choices[0].message.tool_calls![0].id, // Check that it has an ID
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        arguments: JSON.stringify({location: 'New York'})
                    }
                }
            ]);
            expect(result.choices[0].finish_reason).to.equal('tool_calls');
        });

        it('should map different finish reasons correctly', async () => {
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

            // Test different finish reasons
            const finishReasonTests = [
                {vertexReason: 'STOP', openaiReason: 'stop'},
                {vertexReason: 'MAX_TOKENS', openaiReason: 'length'},
                {vertexReason: 'SAFETY', openaiReason: 'content_filter'},
                {vertexReason: 'RECITATION', openaiReason: 'content_filter'},
                {vertexReason: 'FINISH_REASON_STOP', openaiReason: 'stop'},
                {vertexReason: 'FINISH_REASON_MAX_TOKENS', openaiReason: 'length'},
                {vertexReason: 'FINISH_REASON_SAFETY', openaiReason: 'content_filter'},
                {vertexReason: 'FINISH_REASON_RECITATION', openaiReason: 'content_filter'},
                {vertexReason: 'OTHER', openaiReason: 'stop'}
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

                const result = await vertexModel.chatCompletion(mockOpenAIRequest);

                expect(result.choices[0].finish_reason).to.equal(test.openaiReason);
            }
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

        it('should use default location and project if not provided', async () => {
            // Create model without location and project
            const defaultModel = new VertexGeminiOpenAIModel({
                apiKey: 'test-api-key',
                model: 'gemini-pro'
            });

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

            await defaultModel.chatCompletion(mockOpenAIRequest);

            // Verify the fetch was called with the correct URL
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            expect(callArgs[0]).to.equal('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=test-api-key');
        });

        it('should handle top_p parameter in generation config', async () => {
            const mockOpenAIRequest: OpenAIChatCompletionsRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 100,
                top_p: 0.9
            };

            const mockVertexResponse = {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'Response with top_p'
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

            await vertexModel.chatCompletion(mockOpenAIRequest);

            // Verify top_p was included in generation config
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.generationConfig.topP).to.equal(0.9);
        });
    });
});