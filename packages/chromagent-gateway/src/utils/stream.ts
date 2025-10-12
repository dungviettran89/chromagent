import { Response, Request } from 'express';
import { 
  OpenAIChatCompletionCreateParams, 
  OpenAIChatCompletionStreamResponse,
  BackendProvider,
  BackendConfig
} from '../types';
import { ResponseTransformer } from './transformer';

export class StreamingHandler {
  private transformer: ResponseTransformer;
  
  constructor(transformer: ResponseTransformer) {
    this.transformer = transformer;
  }
  
  async handleStreamingRequest(
    backend: BackendProvider,
    backendRequest: any,
    config: BackendConfig,
    res: Response
  ): Promise<void> {
    try {
      // Set streaming response headers
      this.setStreamingHeaders(res);
      
      // Get backend stream
      const backendStream = backend.chatCompletionStream(backendRequest, config);
      
      // Transform and relay stream
      for await (const chunk of this.transformer.transformStreamToOpenAI(
        backendStream,
        res.req.body,
        config.type
      )) {
        // Send chunk as Server-Sent Events
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      
      // Send end marker
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      this.handleStreamingError(error, res);
    }
  }
  
  private setStreamingHeaders(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Disable response buffering
    res.setHeader('X-Accel-Buffering', 'no');
  }
  
  private handleStreamingError(
    error: any,
    res: Response
  ): void {
    // For streaming errors, we need to send an error event
    res.write(`data: ${JSON.stringify({
      error: {
        message: error.message || 'Streaming error',
        type: 'streaming_error',
        code: 'streaming_error'
      }
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}