import { expect } from 'chai';
import { AnthropicModelRegistry } from '../../src/anthropic/AnthropicModelRegistry';
import { AnthropicModel, AnthropicMessageRequest, AnthropicMessageResponse } from '../../src/anthropic/AnthropicModel';

// Mock AnthropicModel implementation for testing
class MockAnthropicModel implements AnthropicModel {
    private modelName: string;

    constructor(modelName: string) {
        this.modelName = modelName;
    }

    async message(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
        return {
            id: 'test-id',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: `Response from ${this.modelName}` }],
            model: this.modelName,
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
                input_tokens: 10,
                output_tokens: 20
            }
        };
    }
}

describe('AnthropicModelRegistry', () => {
    let registry: AnthropicModelRegistry;

    beforeEach(() => {
        registry = new AnthropicModelRegistry();
    });

    describe('register', () => {
        it('should register a model', () => {
            const model = new MockAnthropicModel('test-model');
            registry.register('test-model', model);

            expect(registry.has('test-model')).to.be.true;
        });

        it('should override existing model', () => {
            const model1 = new MockAnthropicModel('test-model');
            const model2 = new MockAnthropicModel('test-model');

            registry.register('test-model', model1);
            registry.register('test-model', model2);

            expect(registry.has('test-model')).to.be.true;
            expect(registry.list().length).to.equal(1);
        });
    });

    describe('unregister', () => {
        it('should unregister a model', () => {
            const model = new MockAnthropicModel('test-model');
            registry.register('test-model', model);

            const result = registry.unregister('test-model');

            expect(result).to.be.true;
            expect(registry.has('test-model')).to.be.false;
        });

        it('should return false when unregistering non-existent model', () => {
            const result = registry.unregister('non-existent-model');

            expect(result).to.be.false;
        });
    });

    describe('has', () => {
        it('should return true for existing model', () => {
            const model = new MockAnthropicModel('test-model');
            registry.register('test-model', model);

            expect(registry.has('test-model')).to.be.true;
        });

        it('should return false for non-existent model', () => {
            expect(registry.has('non-existent-model')).to.be.false;
        });
    });

    describe('list', () => {
        it('should return an array of registered model names', () => {
            const model1 = new MockAnthropicModel('model-1');
            const model2 = new MockAnthropicModel('model-2');

            registry.register('model-1', model1);
            registry.register('model-2', model2);

            const models = registry.list();
            expect(models).to.have.length(2);
            expect(models).to.include('model-1');
            expect(models).to.include('model-2');
        });

        it('should return an empty array when no models are registered', () => {
            const models = registry.list();
            expect(models).to.have.length(0);
        });
    });

    describe('get', () => {
        it('should return the registered model', () => {
            const model = new MockAnthropicModel('test-model');
            registry.register('test-model', model);

            const retrieved = registry.get('test-model');
            expect(retrieved).to.equal(model);
        });

        it('should return undefined for non-existent model', () => {
            const retrieved = registry.get('non-existent-model');
            expect(retrieved).to.be.undefined;
        });
    });
});