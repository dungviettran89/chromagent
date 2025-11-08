import { expect } from 'chai';
import express, { Express } from 'express';
import request from 'supertest';
import 'dotenv/config';
import { AnthropicExpressMiddleware } from '../../src/anthropic/AnthropicExpressMiddleware';
import { AnthropicModelRegistry } from '../../src/anthropic/AnthropicModelRegistry';
import { OpenAIAnthropicModel } from '../../src/anthropic/OpenAIAnthropicModel';
import { VertexGeminiAnthropicModel } from '../../src/anthropic/VertexGeminiAnthropicModel';

describe('AnthropicExpressMiddleware Integration Test', function() {
  this.timeout(30000); // Set timeout to 30 seconds for all tests in this suite

  let app: Express;
  let registry: AnthropicModelRegistry;
  let middleware: AnthropicExpressMiddleware;
  let openAIModel: OpenAIAnthropicModel | null = null;
  let vertexModel: VertexGeminiAnthropicModel | null = null;

  before(function () {
    registry = new AnthropicModelRegistry();

    // Setup for OpenAI model
    if (process.env.OPENAI_COMPATIBLE_URL && process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_MODEL) {
      openAIModel = new OpenAIAnthropicModel({
        url: process.env.OPENAI_COMPATIBLE_URL,
        apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
        model: process.env.OPENAI_COMPATIBLE_MODEL,
      });
      registry.register('openai/test', openAIModel);
    } else {
      console.log('Skipping OpenAI model tests - environment variables not set.');
    }

    // Setup for Vertex model
    if (process.env.VERTEX_GEMINI_API_KEY) {
      vertexModel = new VertexGeminiAnthropicModel({
        apiKey: process.env.VERTEX_GEMINI_API_KEY,
        model: 'gemini-2.5-flash-lite-preview-09-2025',
        location: process.env.VERTEX_LOCATION || 'us-central1',
        project: process.env.VERTEX_PROJECT_ID || 'your-project-id',
      });
      registry.register('vertex/test', vertexModel);
    } else {
      console.log('Skipping Vertex model tests - environment variables not set.');
    }

    app = express();
    app.use(express.json());
  });

  context('without default models', () => {
    before(() => {
      middleware = new AnthropicExpressMiddleware(registry);
      app.post('/api/anthropic/v1/message', middleware.create());
    });

    it('should return a non-streaming response for openai/test model', async function () {
      if (!openAIModel) {
        this.skip();
      }
      const response = await request(app)
        .post('/api/anthropic/v1/message')
        .send({
          model: 'openai/test',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('model');
      expect(response.body.content[0]).to.have.property('text');
    });

    it('should return a non-streaming response for vertex/test model', async function () {
      if (!vertexModel) {
        this.skip();
      }
      const response = await request(app)
        .post('/api/anthropic/v1/message')
        .send({
          model: 'vertex/test',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('model');
      expect(response.body.content[0]).to.have.property('text');
    });

    it('should return a streaming response for openai/test model', async function () {
      if (!openAIModel) {
        this.skip();
      }
      const response = await request(app)
        .post('/api/anthropic/v1/message')
        .send({
          model: 'openai/test',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
          stream: true,
        });

      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.contains('text/event-stream');
      expect(response.text).to.include('data: {"type":"message_start"');
      expect(response.text).to.include('data: {"type":"content_block_start"');
      expect(response.text).to.include('data: {"type":"text_delta"');
      expect(response.text).to.include('data: {"type":"content_block_stop"');
      expect(response.text).to.include('data: {"type":"message_delta"');
      expect(response.text).to.include('data: {"type":"message_stop"');
    });

    it('should return 404 for a model that is not registered', async () => {
      const response = await request(app)
        .post('/api/anthropic/v1/message')
        .send({
          model: 'non-existent-model',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        });

      expect(response.status).to.equal(404);
      expect(response.body.error.type).to.equal('model_not_found');
    });

    it('should return 400 for a malformed request', async () => {
      const response = await request(app)
        .post('/api/anthropic/v1/message')
        .send({
          model: 'openai/test',
          // missing messages
          max_tokens: 10,
        });

      expect(response.status).to.equal(400);
      expect(response.body.error.type).to.equal('invalid_request_error');
    });
  });

  context('with default models', () => {
    before(function() {
      if (!openAIModel) {
        this.skip();
      }
      const defaults = {
        defaultOpusModel: 'openai/test',
        defaultModel: 'openai/test'
      };
      middleware = new AnthropicExpressMiddleware(registry, defaults);
      // Need to use a different path to avoid conflicts with the other tests
      app.post('/api/anthropic/v1/messageWithDefaults', middleware.create());
    });

    it('should use defaultOpusModel for non-existent opus model', async function() {
      if (!openAIModel) {
        this.skip();
      }
      const response = await request(app)
        .post('/api/anthropic/v1/messageWithDefaults')
        .send({
          model: 'claude-3-opus-non-existent',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('id');
      // The model in the response will be the one from the actual model implementation
      expect(response.body.model).to.equal(process.env.OPENAI_COMPATIBLE_MODEL);
    });

    it('should use defaultModel for non-existent model that does not match keywords', async function() {
      if (!openAIModel) {
        this.skip();
      }
      const response = await request(app)
        .post('/api/anthropic/v1/messageWithDefaults')
        .send({
          model: 'some-other-model',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('id');
      expect(response.body.model).to.equal(process.env.OPENAI_COMPATIBLE_MODEL);
    });
  });
});