import { FakeChatModel } from "@langchain/core/utils/testing";
import { RoutingChatModel } from "../../src/langchain/RoutingChatModel";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { expect } from "chai";
import * as sinon from "sinon";
import { ChatGeneration, LLMResult } from "@langchain/core/outputs";

const createMockResult = (message: string): LLMResult => ({
  generations: [
    [
      {
        text: message,
        message: new AIMessage(message),
      } as ChatGeneration,
    ],
  ],
});

describe("RoutingChatModel", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should route to the first available main model", async () => {
    const model1 = new FakeChatModel({});
    const model2 = new FakeChatModel({});
    sinon.stub(model1, "generate").resolves(createMockResult("Model 1"));
    sinon.stub(model2, "generate").resolves(createMockResult("Model 2"));

    const routingModel = new RoutingChatModel({
      mainModels: [model1, model2],
      fallbackModels: [],
    });

    const response = await routingModel.invoke([new HumanMessage("test")]);
    expect(response.content).to.equal("Model 1");
  });

  it("should route to the next main model in round-robin", async () => {
    const model1 = new FakeChatModel({});
    const model2 = new FakeChatModel({});
    sinon.stub(model1, "generate").resolves(createMockResult("Model 1"));
    sinon.stub(model2, "generate").resolves(createMockResult("Model 2"));

    const routingModel = new RoutingChatModel({
      mainModels: [model1, model2],
      fallbackModels: [],
    });

    await routingModel.invoke([new HumanMessage("test")]);
    const response = await routingModel.invoke([new HumanMessage("test")]);
    expect(response.content).to.equal("Model 2");
  });

  it("should fallback to the next main model if one fails", async () => {
    const failingModel = new FakeChatModel({});
    sinon.stub(failingModel, "generate").rejects(new Error("Failure"));
    const model2 = new FakeChatModel({});
    sinon.stub(model2, "generate").resolves(createMockResult("Model 2"));
    const routingModel = new RoutingChatModel({
      mainModels: [failingModel, model2],
      fallbackModels: [],
    });

    const response = await routingModel.invoke([new HumanMessage("test")]);
    expect(response.content).to.equal("Model 2");
  });

  it("should use a fallback model if all main models fail", async () => {
    const failingModel1 = new FakeChatModel({});
    sinon.stub(failingModel1, "generate").rejects(new Error("Failure"));
    const failingModel2 = new FakeChatModel({});
    sinon.stub(failingModel2, "generate").rejects(new Error("Failure"));
    const fallbackModel = new FakeChatModel({});
    sinon.stub(fallbackModel, "generate").resolves(createMockResult("Fallback"));
    const routingModel = new RoutingChatModel({
      mainModels: [failingModel1, failingModel2],
      fallbackModels: [fallbackModel],
    });

    const response = await routingModel.invoke([new HumanMessage("test")]);
    expect(response.content).to.equal("Fallback");
  });

  it("should throw an error if all models fail", async () => {
    const failingModel1 = new FakeChatModel({});
    sinon.stub(failingModel1, "generate").rejects(new Error("Failure"));
    const failingModel2 = new FakeChatModel({});
    sinon.stub(failingModel2, "generate").rejects(new Error("Failure"));
    const failingFallback = new FakeChatModel({});
    sinon.stub(failingFallback, "generate").rejects(new Error("Failure"));

    const routingModel = new RoutingChatModel({
      mainModels: [failingModel1, failingModel2],
      fallbackModels: [failingFallback],
    });

    try {
      await routingModel.invoke([new HumanMessage("test")]);
      // Should not reach here
      expect.fail("Expected an error to be thrown");
    } catch (e: any) {
      expect(e.message).to.equal(
        "All main and fallback models failed to generate a response."
      );
    }
  });

  it("should bring a failed model back into rotation after the cooldown", async () => {
    const failingModel = new FakeChatModel({});
    const generateStub = sinon.stub(failingModel, "generate");
    generateStub.onFirstCall().rejects(new Error("Failure"));
    generateStub.onSecondCall().resolves(createMockResult("Failed Model"));

    const model2 = new FakeChatModel({});
    sinon.stub(model2, "generate").resolves(createMockResult("Model 2"));

    const routingModel = new RoutingChatModel({
      mainModels: [failingModel, model2],
      fallbackModels: [],
      failureCooldown: 100, // 100ms
    });

    // First call fails for failingModel, succeeds for model2
    const response1 = await routingModel.invoke([new HumanMessage("test")]);
    expect(response1.content).to.equal("Model 2");

    // Wait for the cooldown to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Second call should now go to the recovered failingModel
    const response2 = await routingModel.invoke([new HumanMessage("test")]);
    expect(response2.content).to.equal("Failed Model");
  });
});
