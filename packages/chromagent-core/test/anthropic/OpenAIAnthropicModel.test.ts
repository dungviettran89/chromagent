import {expect} from 'chai';
import {OpenAIAnthropicModel} from '../../src/anthropic/OpenAIAnthropicModel';
import {AnthropicMessageRequest} from '../../src/anthropic/AnthropicModel';
import * as sinon from 'sinon';

describe('OpenAIAnthropicModel', () => {
    const mockConfig = {
        url: 'http://localhost:11434/v1',
        apiKey: 'ollama',
        model: 'gemma3:1b'
    };

    let openAIModel: OpenAIAnthropicModel;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        openAIModel = new OpenAIAnthropicModel(mockConfig);
        fetchStub = sinon.stub();
        (globalThis as any).fetch = fetchStub;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('constructor', () => {
        it('should initialize with the provided config', () => {
            expect(openAIModel).to.be.an.instanceOf(OpenAIAnthropicModel);
            expect((openAIModel as any).config).to.deep.equal(mockConfig);
        });
    });

    describe('message', () => {
        it('should transform Anthropic request to OpenAI format and return response', async () => {
            // Define the expected request and response
            const mockAnthropicRequest: AnthropicMessageRequest = {
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

            const mockOpenAIResponse = {
                id: 'chatcmpl-123',
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'I am doing well, thank you for asking!'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 8,
                    total_tokens: 18
                }
            };

            // Set up the mock fetch response
            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOpenAIResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            // Call the message method
            const result = await openAIModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            expect(callArgs[0]).to.equal('http://localhost:11434/v1/chat/completions');
            expect(callArgs[1].method).to.equal('POST');
            expect(callArgs[1].headers['Content-Type']).to.equal('application/json');
            expect(callArgs[1].headers['Authorization']).to.equal('Bearer ollama');

            // Parse the body to check its structure
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.model).to.equal('gemma3:1b'); // Using configured model, not request model
            expect(requestBody.messages).to.deep.equal([
                {
                    role: 'user',
                    content: 'Hello, how are you?'
                }
            ]);
            expect(requestBody.temperature).to.equal(0.7);
            expect(requestBody.max_tokens).to.equal(100);

            // Verify the response is correctly transformed back to Anthropic format
            expect(result).to.deep.include({
                id: 'chatcmpl-123',
                type: 'message',
                role: 'assistant',
                model: 'gemma3:1b', // Using configured model
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 10,
                    output_tokens: 8
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

            const mockOpenAIResponse = {
                id: 'chatcmpl-456',
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'I see a beautiful landscape'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: {
                    prompt_tokens: 15,
                    completion_tokens: 12,
                    total_tokens: 27
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOpenAIResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await openAIModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Check that the image was properly converted to data URL format
            expect(requestBody.messages[0].content).to.deep.equal([
                {
                    type: 'text',
                    text: 'What do you see in this image?'
                },
                {
                    type: 'image_url',
                    image_url: {url: 'data:image/jpeg;base64,some_base64_encoded_data'}
                }
            ]);

            // Verify the response content
            expect(result.content[0]).to.deep.equal({
                type: 'text',
                text: 'I see a beautiful landscape'
            });
        });

        it('should handle tool definitions in requests', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
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
                        name: 'get_weather',
                        description: 'Get the current weather in a given location',
                        input_schema: {
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
                ],
                tool_choice: {
                    type: 'tool',
                    name: 'get_weather'
                }
            };

            const mockOpenAIResponse = {
                id: 'chatcmpl-789',
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'Weather information returned',
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    function: {
                                        name: 'get_weather',
                                        arguments: JSON.stringify({location: 'New York, NY'})
                                    }
                                }
                            ]
                        },
                        finish_reason: 'tool_calls'
                    }
                ],
                usage: {
                    prompt_tokens: 20,
                    completion_tokens: 15,
                    total_tokens: 35
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOpenAIResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await openAIModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Verify that tools are properly included in the request
            expect(requestBody.tools).to.deep.equal([
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
            ]);
            expect(requestBody.tool_choice).to.deep.equal({
                type: 'function',
                function: {name: 'get_weather'}
            });

            // Check that tool usage is properly transformed
            const toolUseBlock = result.content.find(block => block.type === 'tool_use');
            expect(toolUseBlock).to.deep.equal({
                type: 'tool_use',
                id: 'call_123',
                name: 'get_weather',
                input: {location: 'New York, NY'}
            });

            // Verify that the stop reason was properly mapped
            expect(result.stop_reason).to.equal('tool_use');
        });

        it('should handle system prompt correctly', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                system: 'You are a helpful assistant.',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello, who are you?'
                    }
                ],
                max_tokens: 100
            };

            const mockOpenAIResponse = {
                id: 'chatcmpl-101',
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'I am a helpful assistant created to assist you.'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: {
                    prompt_tokens: 8,
                    completion_tokens: 15,
                    total_tokens: 23
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOpenAIResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await openAIModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Check that the system message was properly added to the beginning of messages
            expect(requestBody.messages).to.deep.equal([
                {
                    role: 'system',
                    content: 'You are a helpful assistant.'
                },
                {
                    role: 'user',
                    content: 'Hello, who are you?'
                }
            ]);

            // Verify the response content
            expect(result.content[0]).to.deep.equal({
                type: 'text',
                text: 'I am a helpful assistant created to assist you.'
            });
        });

        it('should throw an error if OpenAI API returns an error response', async () => {
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
                await openAIModel.message(mockAnthropicRequest);
                expect.fail('Expected an error to be thrown');
            } catch (error) {
                expect((error as Error).message).to.match(/OpenAI API error: 500/);
            }
        });

        it('should handle different stop reasons correctly', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Generate a long response'
                    }
                ],
                max_tokens: 100
            };

            const mockOpenAIResponse = {
                id: 'chatcmpl-202',
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'This is the response content'
                        },
                        finish_reason: 'length' // Indicates max tokens reached
                    }
                ],
                usage: {
                    prompt_tokens: 7,
                    completion_tokens: 100, // Max tokens reached
                    total_tokens: 107
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOpenAIResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await openAIModel.message(mockAnthropicRequest);

            // Verify that the stop reason was properly mapped
            expect(result.stop_reason).to.equal('max_tokens');
        });

        it('should handle stop sequences correctly', async () => {
            const mockAnthropicRequest: AnthropicMessageRequest = {
                model: 'some-model',
                messages: [
                    {
                        role: 'user',
                        content: 'Tell me a story'
                    }
                ],
                max_tokens: 100,
                stop_sequences: ['THE END']
            };

            const mockOpenAIResponse = {
                id: 'chatcmpl-303',
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: 'Once upon a time, there was a story that ended here. THE END'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: {
                    prompt_tokens: 6,
                    completion_tokens: 25,
                    total_tokens: 31
                }
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOpenAIResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await openAIModel.message(mockAnthropicRequest);

            // Verify that stop sequences were included in the request
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.stop).to.deep.equal(['THE END']);
        });
    });
});