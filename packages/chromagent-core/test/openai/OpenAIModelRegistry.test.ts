import { OpenAIModelRegistry } from "../../src/openai/OpenAIModelRegistry";
import { OpenAIModel } from "../../src/openai/OpenAIModel";
import { expect } from 'chai';

describe('OpenAIModelRegistry', () => {
    let registry: OpenAIModelRegistry;
    let mockModel: OpenAIModel;

    beforeEach(() => {
        registry = new OpenAIModelRegistry();
        mockModel = {} as OpenAIModel;
    });

    it('should register a model', () => {
        registry.register('test-model', mockModel);
        expect(registry.has('test-model')).to.be.true;
    });

    it('should retrieve a registered model', () => {
        registry.register('test-model', mockModel);
        expect(registry.get('test-model')).to.equal(mockModel);
    });

    it('should return undefined for non-existent model', () => {
        expect(registry.get('non-existent')).to.be.undefined;
    });

    it('should unregister a model', () => {
        registry.register('test-model', mockModel);
        expect(registry.unregister('test-model')).to.be.true;
        expect(registry.has('test-model')).to.be.false;
    });

    it('should return false when unregistering non-existent model', () => {
        expect(registry.unregister('non-existent')).to.be.false;
    });

    it('should list all registered models', () => {
        registry.register('model1', mockModel);
        registry.register('model2', mockModel);
        expect(registry.list()).to.include.members(['model1', 'model2']);
        expect(registry.list().length).to.equal(2);
    });
});
