import { expect } from 'chai';
import { Request, Response } from 'express';
import { AnthropicExpressMiddleware } from '../../src/anthropic/AnthropicExpressMiddleware';
import { AnthropicModelRegistry } from '../../src/anthropic/AnthropicModelRegistry';
import { AnthropicModel, AnthropicMessageRequest, AnthropicMessageResponse } from '../../src/anthropic/AnthropicModel';
import { SinonStub, stub } from 'sinon';
import * as sinon from 'sinon';

// Create a mock AnthropicModel for testing
class MockAnthropicModel implements AnthropicModel {
  private modelName: string;

  constructor(modelName: string = 'test-model') {
    this.modelName = modelName;
  }

  async message(request: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    return {
      id: 'test-message-id',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: `Hello, this is a test response from ${this.modelName}` }],
      model: this.modelName,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5
      }
    };
  }
}

describe('AnthropicExpressMiddleware', () => {
  let registry: AnthropicModelRegistry;
  let middleware: AnthropicExpressMiddleware;
  let mockModel: MockAnthropicModel;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonStub: SinonStub;
  let statusStub: SinonStub;
  let writeHeadStub: SinonStub;
  let writeStub: SinonStub;
  let endStub: SinonStub;

  beforeEach(() => {
    registry = new AnthropicModelRegistry();
    mockModel = new MockAnthropicModel();

    // Set up request stub
    req = {
      body: {
        model: 'test-model',
        messages: [
          {
            role: 'user',
            content: 'Hello, world!'
          }
        ],
        max_tokens: 100
      }
    };

    // Set up response stubs
    jsonStub = sinon.stub();
    statusStub = sinon.stub().returns({ json: jsonStub });
    writeHeadStub = sinon.stub();
    writeStub = sinon.stub();
    endStub = sinon.stub();

    res = {
      status: statusStub,
      json: jsonStub,
      writeHead: writeHeadStub,
      write: writeStub,
      end: endStub
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('constructor', () => {
    it('should initialize with the provided registry', () => {
      middleware = new AnthropicExpressMiddleware(registry);
      expect(middleware).to.be.an.instanceOf(AnthropicExpressMiddleware);
    });

    it('should initialize with default models', () => {
      const defaults = {
        defaultOpusModel: 'opus-default',
        defaultSonnetModel: 'sonnet-default',
        defaultHaikuModel: 'haiku-default',
        defaultModel: 'default-model'
      };
      middleware = new AnthropicExpressMiddleware(registry, defaults);
      expect(middleware).to.have.property('defaultOpusModel', 'opus-default');
      expect(middleware).to.have.property('defaultSonnetModel', 'sonnet-default');
      expect(middleware).to.have.property('defaultHaikuModel', 'haiku-default');
      expect(middleware).to.have.property('defaultModel', 'default-model');
    });
  });

  describe('create', () => {
    beforeEach(() => {
      middleware = new AnthropicExpressMiddleware(registry);
    });

    it('should return a function that handles requests', async () => {
      const handler = middleware.create();
      expect(handler).to.be.a('function');

      // Register a model to use in the test
      registry.register('test-model', mockModel);

      // Call the handler with mock request and response
      await handler(req as Request, res as Response);

      // Verify that the response status was called with 200
      expect(statusStub.calledOnce).to.be.true;
      expect(statusStub.firstCall.args[0]).to.equal(200);
    });

    it('should return an error when required fields are missing', async () => {
      // Remove required field
      req.body = {
        model: 'test-model',
        // Missing messages field
        max_tokens: 100
      };

      const handler = middleware.create();
      await handler(req as Request, res as Response);

      // Verify that the response status was called with 400
      expect(statusStub.calledOnce).to.be.true;
      expect(statusStub.firstCall.args[0]).to.equal(400);
      expect(jsonStub.calledOnce).to.be.true;
    });

    it('should return an error when the model is not found and no defaults are set', async () => {
      const handler = middleware.create();
      await handler(req as Request, res as Response);

      // Verify that the response status was called with 404
      expect(statusStub.calledOnce).to.be.true;
      expect(statusStub.firstCall.args[0]).to.equal(404);
      expect(jsonStub.calledOnce).to.be.true;
    });

    context('with default models', () => {
      beforeEach(() => {
        const defaults = {
          defaultOpusModel: 'default-opus',
          defaultSonnetModel: 'default-sonnet',
          defaultHaikuModel: 'default-haiku',
          defaultModel: 'default-general'
        };
        middleware = new AnthropicExpressMiddleware(registry, defaults);
        registry.register('default-opus', new MockAnthropicModel('default-opus'));
        registry.register('default-sonnet', new MockAnthropicModel('default-sonnet'));
        registry.register('default-haiku', new MockAnthropicModel('default-haiku'));
        registry.register('default-general', new MockAnthropicModel('default-general'));
      });

      it('should use defaultOpusModel for non-existent opus model', async () => {
        req.body.model = 'claude-3-opus-non-existent';
        const handler = middleware.create();
        await handler(req as Request, res as Response);
        expect(statusStub.firstCall.args[0]).to.equal(200);
        expect(jsonStub.firstCall.args[0].model).to.equal('default-opus');
      });

      it('should use defaultSonnetModel for non-existent sonnet model', async () => {
        req.body.model = 'claude-3-sonnet-non-existent';
        const handler = middleware.create();
        await handler(req as Request, res as Response);
        expect(statusStub.firstCall.args[0]).to.equal(200);
        expect(jsonStub.firstCall.args[0].model).to.equal('default-sonnet');
      });

      it('should use defaultHaikuModel for non-existent haiku model', async () => {
        req.body.model = 'claude-3-haiku-non-existent';
        const handler = middleware.create();
        await handler(req as Request, res as Response);
        expect(statusStub.firstCall.args[0]).to.equal(200);
        expect(jsonStub.firstCall.args[0].model).to.equal('default-haiku');
      });

      it('should use defaultModel for non-existent model that does not match keywords', async () => {
        req.body.model = 'some-other-model';
        const handler = middleware.create();
        await handler(req as Request, res as Response);
        expect(statusStub.firstCall.args[0]).to.equal(200);
        expect(jsonStub.firstCall.args[0].model).to.equal('default-general');
      });
    });

    it('should return a streaming response when stream is true', async () => {
      // Register a model to use in the test
      registry.register('test-model', mockModel);

      // Add stream property to request
      req.body.stream = true;

      const handler = middleware.create();
      await handler(req as Request, res as Response);

      // Verify that streaming headers were set
      expect(writeHeadStub.calledOnce).to.be.true;
      expect(writeHeadStub.firstCall.args[0]).to.equal(200);
      expect(writeHeadStub.firstCall.args[1]['Content-Type']).to.contains('text/event-stream');
    });

    it('should return a regular JSON response when stream is false or not provided', async () => {
      // Register a model to use in the test
      registry.register('test-model', mockModel);

      const handler = middleware.create();
      await handler(req as Request, res as Response);

      // Verify that the response status was called with 200 and json was called
      expect(statusStub.calledOnce).to.be.true;
      expect(statusStub.firstCall.args[0]).to.equal(200);
      expect(jsonStub.calledOnce).to.be.true;
      expect(jsonStub.firstCall.args[0]).to.deep.include({
        id: 'test-message-id',
        type: 'message',
        role: 'assistant',
        model: 'test-model',
      });
    });

    it('should handle errors properly', async () => {
      // Create a model that throws an error
      const errorModel: AnthropicModel = {
        message: async () => {
          throw new Error('Test error');
        }
      };
      registry.register('error-model', errorModel);

      // Update request to use the error model
      req.body.model = 'error-model';

      const handler = middleware.create();
      await handler(req as Request, res as Response);

      // Verify that the response status was called with 500
      expect(statusStub.calledOnce).to.be.true;
      expect(statusStub.firstCall.args[0]).to.equal(500);
      expect(jsonStub.calledOnce).to.be.true;
    });
  });
});
