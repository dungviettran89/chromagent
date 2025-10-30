import {expect} from 'chai';
import {OllamaAnthropicModel} from '../../src/anthropic/OllamaAnthropicModel';
import {AnthropicMessageRequest} from '../../src/anthropic/AnthropicModel';
import * as sinon from 'sinon';

describe('OllamaAnthropicModel', () => {
    const mockConfig = {
        url: 'http://localhost:11434',
        model: 'gemma3:1b'
    };

    let ollamaModel: OllamaAnthropicModel;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
        ollamaModel = new OllamaAnthropicModel(mockConfig);
        fetchStub = sinon.stub();
        (globalThis as any).fetch = fetchStub;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('constructor', () => {
        it('should initialize with the provided config', () => {
            expect(ollamaModel).to.be.an.instanceOf(OllamaAnthropicModel);
            expect((ollamaModel as any).config).to.deep.equal(mockConfig);
        });
    });

    describe('message', () => {
        it('should transform Anthropic request to Ollama format and return response', async () => {
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

            const mockOllamaResponse = {
                message: {
                    content: 'I am doing well, thank you for asking!'
                },
                done: true,
                done_reason: 'stop',
                eval_count: 10,
                prompt_eval_count: 5
            };

            // Set up the mock fetch response
            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOllamaResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            // Call the message method
            const result = await ollamaModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            expect(callArgs[0]).to.equal('http://localhost:11434/api/chat');
            expect(callArgs[1].method).to.equal('POST');
            expect(callArgs[1].headers['Content-Type']).to.equal('application/json');

            // Parse the body to check its structure
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.model).to.equal('gemma3:1b'); // Using configured model, not request model
            expect(requestBody.messages).to.deep.equal([
                {
                    role: 'user',
                    content: 'Hello, how are you?'
                }
            ]);
            expect(requestBody.options).to.deep.equal({
                temperature: 0.7,
                num_predict: 100
            });

            // Verify the response is correctly transformed back to Anthropic format
            expect(result).to.deep.include({
                type: 'message',
                role: 'assistant',
                model: 'gemma3:1b', // Using configured model
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 5,
                    output_tokens: 10
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

            const mockOllamaResponse = {
                message: {
                    content: 'I see a beautiful landscape'
                },
                done: true,
                eval_count: 8,
                prompt_eval_count: 6
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOllamaResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await ollamaModel.message(mockAnthropicRequest);

            // Verify the fetch was called with correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);
            expect(requestBody.messages[0].images).to.deep.equal(['some_base64_encoded_data']);
            expect(requestBody.messages[0].content).to.equal('What do you see in this image?');

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

            const mockOllamaResponse = {
                message: {
                    content: 'Weather information returned',
                    tool_calls: [
                        {
                            id: 'call_123',
                            function: {
                                name: 'get_weather',
                                arguments: {location: 'New York, NY'}
                            }
                        }
                    ]
                },
                done: true,
                eval_count: 12,
                prompt_eval_count: 7
            };

            const mockFetchResponse = {
                ok: true,
                json: () => Promise.resolve(mockOllamaResponse)
            };

            fetchStub.resolves(mockFetchResponse);

            const result = await ollamaModel.message(mockAnthropicRequest);

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
        });

        it('should throw an error if Ollama API returns an error response', async () => {
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
                await ollamaModel.message(mockAnthropicRequest);
                expect.fail('Expected an error to be thrown');
            } catch (error) {
                expect((error as Error).message).to.match(/Ollama API error: 500/);
            }
        });

        it('should call the correct API endpoint with stream=false for non-streaming requests', async () => {
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
                ok: true,
                json: () => Promise.resolve({
                    message: {content: 'Response'},
                    done: true,
                    eval_count: 5,
                    prompt_eval_count: 3
                })
            };

            fetchStub.resolves(mockFetchResponse);

            await ollamaModel.message(mockAnthropicRequest);

            // Verify the fetch was called with the correct parameters
            expect(fetchStub.calledOnce).to.be.true;
            const callArgs = fetchStub.firstCall.args;
            const requestBody = JSON.parse(callArgs[1].body);

            // Ensure stream is set to false for non-streaming requests
            expect(requestBody.stream).to.be.false;
            expect(callArgs[0]).to.equal('http://localhost:11434/api/chat');
        });
    });


});