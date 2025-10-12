import { Router, Request, Response } from 'express';
import { RequestRouter } from '../service/requestRouter';
import { RequestTransformer } from '../utils/transformer';
import { ResponseTransformer } from '../utils/transformer';
import { StreamingHandler } from '../utils/stream';
import { BackendProvider, BackendConfig, OpenAIChatCompletionCreateParams } from '../types';

interface ChatCompletionsRouterParams {
  backendRouter: RequestRouter;
  requestTransformer: RequestTransformer;
  responseTransformer: ResponseTransformer;
  streamingHandler: StreamingHandler;
}

export function chatCompletionsRouter({
  backendRouter,
  requestTransformer,
  responseTransformer,
  streamingHandler
}: ChatCompletionsRouterParams): Router {
  const router = Router();
  
  router.post('/chat/completions', async (req: Request, res: Response) => {
    try {
      // Validate request
      const openaiRequest: OpenAIChatCompletionCreateParams = req.body;
      
      // Validate required fields
      if (!openaiRequest.model) {
        return res.status(400).json({
          error: {
            message: 'Missing required field: model',
            type: 'invalid_request_error',
            code: 'missing_model'
          }
        });
      }
      
      if (!openaiRequest.messages || !Array.isArray(openaiRequest.messages)) {
        return res.status(400).json({
          error: {
            message: 'Missing required field: messages (must be an array)',
            type: 'invalid_request_error',
            code: 'missing_messages'
          }
        });
      }
      
      // Determine backend based on model or configuration
      const routingResult = backendRouter.determineBackend(openaiRequest);
      if (!routingResult) {
        return res.status(400).json({
          error: {
            message: 'No suitable backend found for the request',
            type: 'invalid_request_error',
            code: 'no_backend_found'
          }
        });
      }
      
      const { config } = routingResult;
      const backend = backendRouter.getBackend(config.type);
      
      if (!backend) {
        return res.status(500).json({
          error: {
            message: `Backend provider for type ${config.type} not found`,
            type: 'gateway_error',
            code: 'backend_not_found'
          }
        });
      }
      
      // Transform request to backend format
      const backendRequest = requestTransformer.transformToBackend(
        openaiRequest,
        config.type
      );
      
      // Check if streaming is requested
      if (openaiRequest.stream) {
        await streamingHandler.handleStreamingRequest(backend, backendRequest, config, res);
      } else {
        await handleNonStreamingRequest(backend, backendRequest, config, res, responseTransformer, openaiRequest);
      }
      // Explicit return to satisfy TypeScript
      return;
    } catch (error: any) {
      console.error('Error in chat completions route:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'gateway_error',
          code: 'gateway_error'
        }
      });
      // Explicit return to satisfy TypeScript
      return;
    }
  });
  
  return router;
}

async function handleNonStreamingRequest(
  backend: BackendProvider,
  backendRequest: any,
  config: BackendConfig,
  res: Response,
  responseTransformer: ResponseTransformer,
  originalRequest: OpenAIChatCompletionCreateParams
): Promise<void> {
  try {
    // Call backend
    const backendResponse = await backend.chatCompletion(backendRequest, config);
    
    // Transform response to OpenAI format
    const openaiResponse = responseTransformer.transformToOpenAI(
      backendResponse,
      originalRequest,
      config.type
    );
    
    // Send response
    res.status(200).json(openaiResponse);
  } catch (error: any) {
    console.error('Error in non-streaming request:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Backend API error',
        type: 'backend_error',
        code: 'backend_error'
      }
    });
  }
}