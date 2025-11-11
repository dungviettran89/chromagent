import "mocha";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { expect } from "chai";
import * as sinon from "sinon";
import { AnthropicModelRegistry } from "../../src/anthropic/AnthropicModelRegistry";
import { LoadBalancedAnthropicModel } from "../../src/anthropic/LoadBalancedAnthropicModel";
import { AnthropicModel } from "../../src/anthropic/AnthropicModel";
import { Message, MessageParam } from "@anthropic-ai/sdk/messages";

chai.use(chaiAsPromised);

describe("LoadBalancedAnthropicModel", () => {
    let registry: AnthropicModelRegistry;
    let model1: sinon.SinonStubbedInstance<AnthropicModel>;
    let model2: sinon.SinonStubbedInstance<AnthropicModel>;
    let loadBalancer: LoadBalancedAnthropicModel;

    beforeEach(() => {
        registry = new AnthropicModelRegistry();
        model1 = sinon.stub({ invoke: async () => ({} as Message) });
        model2 = sinon.stub({ invoke: async () => ({} as Message) });
        registry.register("model1", model1);
        registry.register("model2", model2);
    });

    it("should select a model based on weight and invoke it", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 0 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        const response: Message = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 }
        };
        model1.invoke.resolves(response);

        const result = await loadBalancer.invoke([{ role: "user", content: "hello" }]);

        expect(result).to.equal(response);
        expect(model1.invoke.calledOnce).to.be.true;
        expect(model2.invoke.called).to.be.false;
    });

    it("should try the next model if the first one fails", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        const response: Message = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 }
        };
        model1.invoke.rejects(new Error("Model 1 failed"));
        model2.invoke.resolves(response);

        const result = await loadBalancer.invoke([{ role: "user", content: "hello" }]);

        expect(result).to.equal(response);
        expect(model1.invoke.called || model2.invoke.called).to.be.true;
    });

    it("should throw an error if all models fail", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        model1.invoke.rejects(new Error("Model 1 failed"));
        model2.invoke.rejects(new Error("Model 2 failed"));

        await expect(loadBalancer.invoke([{ role: "user", content: "hello" }])).to.be.rejectedWith(/Model \d failed/);
    });

    it("should remove a model if it returns an invalid response", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 10);
        const invalidResponse = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [],
            usage: { input_tokens: 1, output_tokens: 1 }
        };
        const validResponse: Message = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 }
        };
        model1.invoke.resolves(invalidResponse as any);
        model2.invoke.resolves(validResponse);

        const result = await loadBalancer.invoke([{ role: "user", content: "hello" }]);

        expect(result).to.equal(validResponse);
        // model1 is guaranteed to be called, either first or second.
        // If model2 is called first, it will return a valid response and model1 will not be called.
        // So we can only assert that at least one of them is called.
        // However, since we are removing the invalid model, the valid one must be called.
        expect(model2.invoke.calledOnce).to.be.true;
    });

    it("should skip a failed model for errorTimeoutMs duration", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 100); // 100ms timeout
        const validResponse: Message = {
            id: "1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "world" }],
            usage: { input_tokens: 1, output_tokens: 1 }
        };

        const selectModelStub = sinon.stub(loadBalancer as any, 'selectModel');

        // First invocation: model1 fails, then model2 succeeds
        selectModelStub.callsFake((modelsToTry: ModelWithWeight[]) => {
            if (modelsToTry.some(m => m.name === "model1")) {
                return modelsToTry.find(m => m.name === "model1");
            }
            return modelsToTry[0];
        });
        model1.invoke.rejects(new Error("Model 1 failed"));
        model2.invoke.resolves(validResponse);
        await loadBalancer.invoke([{ role: "user", content: "hello" }]);
        expect(model1.invoke.calledOnce).to.be.true;
        expect(model2.invoke.calledOnce).to.be.true;

        // Reset mocks for next invocation
        model1.invoke.resetHistory();
        model2.invoke.resetHistory();
        selectModelStub.resetHistory();

        // Second invocation within timeout: model1 should be skipped, model2 should be called and fail
        selectModelStub.callsFake((modelsToTry: ModelWithWeight[]) => {
            if (modelsToTry.some(m => m.name === "model2")) {
                return modelsToTry.find(m => m.name === "model2");
            }
            return modelsToTry[0];
        });
        model1.invoke.rejects(new Error("Model 1 failed")); // Still failing
        model2.invoke.rejects(new Error("Model 2 failed")); // Now model2 also fails
        await expect(loadBalancer.invoke([{ role: "user", content: "hello" }])).to.be.rejectedWith(/Model \d failed/);
        expect(model1.invoke.called).to.be.false; // model1 skipped
        expect(model2.invoke.calledOnce).to.be.true; // model2 called and failed

        // Wait for timeout to pass
        await new Promise(resolve => setTimeout(resolve, 110));

        // Reset mocks for next invocation
        model1.invoke.resetHistory();
        model2.invoke.resetHistory();
        selectModelStub.resetHistory();

        // Third invocation after timeout: model1 should be re-included and called, model2 still in cooldown
        selectModelStub.callsFake((modelsToTry: ModelWithWeight[]) => {
            if (modelsToTry.some(m => m.name === "model1")) {
                return modelsToTry.find(m => m.name === "model1");
            }
            return modelsToTry[0];
        });
        model1.invoke.resolves(validResponse); // model1 now succeeds
        model2.invoke.rejects(new Error("Model 2 failed")); // model2 still failing
        await loadBalancer.invoke([{ role: "user", content: "hello" }]);
        expect(model1.invoke.calledOnce).to.be.true;
        expect(model2.invoke.called).to.be.false;

        selectModelStub.restore(); // Restore the original selectModel method
    });


    it("should throw an error if all models are in cooldown", async () => {
        const models = [{ name: "model1", weight: 100 }, { name: "model2", weight: 100 }];
        loadBalancer = new LoadBalancedAnthropicModel(registry, models, 100); // 100ms timeout
        model1.invoke.rejects(new Error("Model 1 failed"));
        model2.invoke.rejects(new Error("Model 2 failed"));

        // First invocation: both models fail and go into cooldown
        await expect(loadBalancer.invoke([{ role: "user", content: "hello" }])).to.be.rejectedWith(/Model \d failed/);

        // Second invocation within timeout: all models are in cooldown
        await expect(loadBalancer.invoke([{ role: "user", content: "hello" }])).to.be.rejectedWith("No models available to handle the request after considering error timeouts.");
    });
});