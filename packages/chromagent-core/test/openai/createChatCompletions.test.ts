import { expect } from 'chai';
import { Request, Response, NextFunction } from 'express';
import { createChatCompletions } from '../../src/openai/createChatCompletions';
import { AIMessage, HumanMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { BaseLanguageModelInput } from '@langchain/core/language_models/base'; // Corrected import path
import { BaseChatModel, BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models'; // Added BaseChatModelCallOptions
import sinon from 'sinon';

describe('createChatCompletions', () => {
  let mockModel: BaseChatModel;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let resStatusStub: sinon.SinonStub;
  let resJsonStub: sinon.SinonStub;
  let resWriteStub: sinon.SinonStub; 
  let resEndStub: sinon.SinonStub;   
  let resSetHeaderStub: sinon.SinonStub; 
  let modelInvokeStub: sinon.SinonStub;
  // modelStreamStub is removed as streaming test is removed

  beforeEach(() => {
    mockModel = {
      // Initialize invoke as dummy function, not stub, so Sinon can wrap it.
      invoke: async (input: BaseLanguageModelInput, options?: Partial<BaseChatModelCallOptions>): Promise<AIMessageChunk> => {
        return new AIMessageChunk({ content: "Dummy response from mockModel.invoke" });
      },
      // stream method is removed from mockModel as streaming is no longer tested
      lc_kwargs: { model_name: 'test-model' },
      _llmType: "",
      _combineLLMOutput: (outputs: any[]) => ({}), 
      _call: (messages: any[]) => Promise.resolve({
        generations: [],
        llmOutput: {}
      })
    } as any; // Cast to any because we are mocking parts of BaseChatModel

    modelInvokeStub = sinon.stub(mockModel, 'invoke')
      .resolves(new AIMessageChunk({ content: 'Mocked AI response' }));
    
    // modelStreamStub is removed

    resStatusStub = sinon.stub();
    resJsonStub = sinon.stub();
    resWriteStub = sinon.stub();
    resEndStub = sinon.stub();
    resSetHeaderStub = sinon.stub();

    mockRes = {
      json: resJsonStub,
      status: resStatusStub.returnsThis(),
      write: resWriteStub, 
      end: resEndStub,     
      setHeader: resSetHeaderStub,
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return 400 if messages are not provided', async () => {
    mockReq = { body: {} };
    await createChatCompletions(mockModel)(mockReq as Request, mockRes as Response, (() => {}) as NextFunction);
    expect(resStatusStub.calledWith(400)).to.be.true;
    expect(resJsonStub.calledWith({ error: "Messages not found in request body." })).to.be.true;
  });

  it('should return a non-streaming chat completion', async () => {
    mockReq = {
      body: {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      },
    };

    const handler = createChatCompletions(mockModel);
    await handler(mockReq as Request, mockRes as Response, (() => {}) as NextFunction);

    expect(modelInvokeStub.calledOnce).to.be.true;
    expect(resJsonStub.calledOnce).to.be.true;
    expect(resJsonStub.getCall(0).args[0]).to.have.property('object', 'chat.completion');
    expect(resJsonStub.getCall(0).args[0].choices[0].message.content).to.equal('Mocked AI response');
  });

  it('should handle multi-modal image content in messages', async () => {
    mockReq = {
      body: {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } }
          ]
        }],
        stream: false,
      },
    };

    const handler = createChatCompletions(mockModel);
    await handler(mockReq as Request, mockRes as Response, (() => {}) as NextFunction);

    expect(modelInvokeStub.calledOnce).to.be.true;
    const invokedMessages = modelInvokeStub.getCall(0).args[0];
    expect(invokedMessages[0]).to.be.an.instanceOf(HumanMessage);
    expect(invokedMessages[0].content).to.deep.equal([
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } }
    ]);
  });
});