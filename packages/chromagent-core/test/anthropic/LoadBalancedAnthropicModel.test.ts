import "mocha";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { expect } from "chai";
import * as sinon from "sinon";
import { AnthropicModelRegistry } from "../../src/anthropic/AnthropicModelRegistry";
import { LoadBalancedAnthropicModel } from "../../src/anthropic/LoadBalancedAnthropicModel";
import { AnthropicModel, AnthropicMessageRequest, AnthropicMessageResponse } from "../../src/anthropic/AnthropicModel";

chai.use(chaiAsPromised);

describe("LoadBalancedAnthropicModel", () => {
    let registry: AnthropicModelRegistry;
    let model1: sinon.SinonStubbedInstance<AnthropicModel>;
    let model2: sinon.SinonStubbedInstance<AnthropicModel>;
    let loadBalancer: LoadBalancedAnthropicModel;
    let request: AnthropicMessageRequest;

    beforeEach(() => {
        registry = new AnthropicModelRegistry();
        model1 = sinon.createStubInstance(class MockModel implements AnthropicModel {
            message(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
                return Promise.resolve({} as AnthropicMessageResponse);
            }
        });
        model2 = sinon.createStubInstance(class MockModel implements AnthropicModel {
            message(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
                return Promise.resolve({} as AnthropicMessageResponse);
            }
        });
        registry.register("model1", model1);
        registry.register("model2", model2);
        request = {
            model: "test-model",
            messages: [{ role: "user", content: "hello" }],
            max_tokens: 10
        };
    });

    it("should select a model based on weight and call it", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 0 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        const response: AnthropicMessageResponse = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: "model1",
            stop_reason: "end_turn",
            stop_sequence: null
        };
        model1.message.resolves(response);

        const result = await loadBalancer.message(request);

        expect(result).to.equal(response);
        expect(model1.message.calledOnce).to.be.true;
        expect(model2.message.called).to.be.false;
    });

    it("should try the next model if the first one fails", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        const response: AnthropicMessageResponse = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: "model2",
            stop_reason: "end_turn",
            stop_sequence: null
        };
        model1.message.rejects(new Error("Model 1 failed"));
        model2.message.resolves(response);

        const result = await loadBalancer.message(request);

        expect(result).to.equal(response);
        expect(model1.message.called || model2.message.called).to.be.true;
    });

    it("should throw an error if all models fail", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        model1.message.rejects(new Error("Model 1 failed"));
        model2.message.rejects(new Error("Model 2 failed"));

        await expect(loadBalancer.message(request)).to.be.rejectedWith(/Model \d failed/);
    });

    it("should remove a model if it returns an invalid response", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        const invalidResponse: AnthropicMessageResponse = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: "model1",
            stop_reason: "end_turn",
            stop_sequence: null
        };
        const validResponse: AnthropicMessageResponse = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: "model2",
            stop_reason: "end_turn",
            stop_sequence: null
        };
        model1.message.resolves(invalidResponse);
        model2.message.resolves(validResponse);

        const result = await loadBalancer.message(request);

        expect(result).to.equal(validResponse);
        expect(model2.message.calledOnce).to.be.true;
    });

    it("should skip a failed model for errorTimeoutMs duration", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 100); // 100ms timeout
        const validResponse: AnthropicMessageResponse = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: "model1",
            stop_reason: "end_turn",
            stop_sequence: null
        };

        const selectModelStub = sinon.stub(loadBalancer as any, 'selectModel').callsFake((modelsToTry: any) => {
            return modelsToTry[0];
        });

        // First invocation: model1 fails, then model2 succeeds
        model1.message.rejects(new Error("Model 1 failed"));
        model2.message.resolves(validResponse);
        await loadBalancer.message(request);
        expect(model1.message.calledOnce).to.be.true;
        expect(model2.message.calledOnce).to.be.true;

        // Reset mocks for next invocation
        model1.message.resetHistory();
        model2.message.resetHistory();

        // Second invocation within timeout: model1 should be skipped, model2 should be called and fail
        model1.message.rejects(new Error("Model 1 failed")); // Still failing
        model2.message.rejects(new Error("Model 2 failed")); // Now model2 also fails
        await expect(loadBalancer.message(request)).to.be.rejectedWith("Model 2 failed");
        expect(model1.message.called).to.be.false; // model1 skipped
        expect(model2.message.calledOnce).to.be.true; // model2 called and failed

        // Wait for timeout to pass
        await new Promise(resolve => setTimeout(resolve, 110));

        // Reset mocks for next invocation
        model1.message.resetHistory();
        model2.message.resetHistory();

        // Third invocation after timeout: model1 should be re-included and called, model2 still in cooldown
        model1.message.resolves(validResponse); // model1 now succeeds
        model2.message.rejects(new Error("Model 2 failed")); // model2 still failing
        await loadBalancer.message(request);
        expect(model1.message.calledOnce).to.be.true;
        expect(model2.message.called).to.be.false;

        selectModelStub.restore();
    });


    it("should throw an error if all models are in cooldown", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 100);
        model1.message.rejects(new Error("Model 1 failed"));
        model2.message.rejects(new Error("Model 2 failed"));

        await expect(loadBalancer.message(request)).to.be.rejectedWith(/Model \d failed/);

        await expect(loadBalancer.message(request)).to.be.rejectedWith("No models available to handle the request after considering error timeouts.");
    });
});