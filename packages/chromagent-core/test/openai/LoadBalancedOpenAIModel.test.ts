import { LoadBalancedOpenAIModel } from "../../src/openai/LoadBalancedOpenAIModel";
import { OpenAIModelRegistry } from "../../src/openai/OpenAIModelRegistry";
import { OpenAIChatCompletionsRequest, OpenAIModel } from "../../src/openai/OpenAIModel";
import { expect } from 'chai';
import sinon from 'sinon';

describe('LoadBalancedOpenAIModel', () => {
    let registry: OpenAIModelRegistry;
    let mockModel1: sinon.SinonStubbedInstance<OpenAIModel>;
    let mockModel2: sinon.SinonStubbedInstance<OpenAIModel>;
    let loadBalancedModel: LoadBalancedOpenAIModel;
    let randomStub: sinon.SinonStub;

    const request: OpenAIChatCompletionsRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }]
    };

    beforeEach(() => {
        registry = new OpenAIModelRegistry();
        mockModel1 = {
            chatCompletion: sinon.stub()
        };
        mockModel2 = {
            chatCompletion: sinon.stub()
        };

        registry.register('model1', mockModel1);
        registry.register('model2', mockModel2);

        loadBalancedModel = new LoadBalancedOpenAIModel(registry, [
            { name: 'model1', weight: 1 },
            { name: 'model2', weight: 1 }
        ], 100); // Short timeout for testing
        
        randomStub = sinon.stub(Math, 'random');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should successfully call a model', async () => {
        mockModel1.chatCompletion.resolves({
            id: '1',
            choices: [{ message: { role: 'assistant', content: 'response' }, index: 0, finish_reason: 'stop', logprobs: null }],
            created: 123,
            model: 'gpt-4',
            object: 'chat.completion',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        });

        // Force select model1
        randomStub.returns(0.1); // weight 1, total 2, 0.1 < 1

        const response = await loadBalancedModel.chatCompletion(request);
        
        expect(mockModel1.chatCompletion.calledWith(request)).to.be.true;
        expect(response).to.not.be.undefined;
    });

    it('should failover to next model on error', async () => {
        randomStub.returns(0.1); // Select model1 first

        mockModel1.chatCompletion.rejects(new Error('Network error'));
        mockModel2.chatCompletion.resolves({
            id: '2',
            choices: [{ message: { role: 'assistant', content: 'response' }, index: 0, finish_reason: 'stop', logprobs: null }],
            created: 123,
            model: 'gpt-4',
            object: 'chat.completion',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        });

        const response = await loadBalancedModel.chatCompletion(request);

        expect(mockModel1.chatCompletion.called).to.be.true;
        expect(mockModel2.chatCompletion.called).to.be.true;
        expect(response).to.not.be.undefined;
    });

    it('should failover to next model on invalid response', async () => {
        randomStub.returns(0.1); // Select model1 first

        mockModel1.chatCompletion.resolves({
            // Invalid response (missing choices)
        } as any);

        mockModel2.chatCompletion.resolves({
            id: '2',
            choices: [{ message: { role: 'assistant', content: 'response' }, index: 0, finish_reason: 'stop', logprobs: null }],
            created: 123,
            model: 'gpt-4',
            object: 'chat.completion',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        });

        const response = await loadBalancedModel.chatCompletion(request);

        expect(mockModel1.chatCompletion.called).to.be.true;
        expect(mockModel2.chatCompletion.called).to.be.true;
        expect(response).to.not.be.undefined;
    });

    it('should throw error if all models fail', async () => {
        mockModel1.chatCompletion.rejects(new Error('Error 1'));
        mockModel2.chatCompletion.rejects(new Error('Error 2'));

        try {
            await loadBalancedModel.chatCompletion(request);
            expect.fail("Should have thrown error");
        } catch (e) {
            expect(e).to.not.be.undefined;
        }
    });

    it('should retry failed model after timeout', async () => {
        randomStub.returns(0.1); // Select model1

        // First failure
        mockModel1.chatCompletion.onFirstCall().rejects(new Error('Error 1'));
        
        mockModel2.chatCompletion.resolves({
            id: '2',
            choices: [{ message: { role: 'assistant', content: 'response' }, index: 0, finish_reason: 'stop', logprobs: null }],
            created: 123,
            model: 'gpt-4',
            object: 'chat.completion',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        });

        await loadBalancedModel.chatCompletion(request);
        expect(mockModel1.chatCompletion.calledOnce).to.be.true;

        // Wait for timeout
        await new Promise(resolve => setTimeout(resolve, 150));

        // Should try model1 again
        mockModel1.chatCompletion.onSecondCall().resolves({
            id: '1',
            choices: [{ message: { role: 'assistant', content: 'response' }, index: 0, finish_reason: 'stop', logprobs: null }],
            created: 123,
            model: 'gpt-4',
            object: 'chat.completion',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        });

        await loadBalancedModel.chatCompletion(request);
        expect(mockModel1.chatCompletion.calledTwice).to.be.true;
    });
});
