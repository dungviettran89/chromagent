import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import morgan from 'morgan';
import { GatewayConfig } from './types';
import { RequestRouter } from './service/requestRouter';
import { RequestTransformer } from './utils/transformer';
import { ResponseTransformer } from './utils/transformer';
import { TokenUsageService } from './utils/token';
import { StreamingHandler } from './utils/stream';
import { DefaultBackendRegistry } from './backends/registry';
import { chatCompletionsRouter } from './routes/chat';

export class GatewayServer {
  private app: Express;
  private config: GatewayConfig;
  private backendRouter: RequestRouter;
  private requestTransformer: RequestTransformer;
  private responseTransformer: ResponseTransformer;
  private tokenUsageService: TokenUsageService;
  private streamingHandler: StreamingHandler;
  private backendRegistry: DefaultBackendRegistry;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.app = express();
    this.backendRegistry = new DefaultBackendRegistry();
    this.backendRouter = new RequestRouter(this.backendRegistry, config.backends);
    this.requestTransformer = new RequestTransformer();
    this.responseTransformer = new ResponseTransformer();
    this.tokenUsageService = new TokenUsageService();
    this.streamingHandler = new StreamingHandler(this.responseTransformer);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS support
    if (this.config.cors) {
      this.app.use(cors({
        origin: this.config.cors.origin,
        credentials: this.config.cors.credentials,
      }));
    }
    
    // Body parsing
    this.app.use(express.json({ 
      limit: '10mb', // Support for image data
      type: ['application/json', 'text/plain'] 
    }));
    
    // Rate limiting - apply to all routes
    if (this.config.rateLimit) {
      const limiter = rateLimit({
        windowMs: this.config.rateLimit.windowMs,
        max: this.config.rateLimit.max,
      }) as any; // Type assertion to avoid specific type issues
      this.app.use(limiter);
    }
    
    // Request logging
    this.app.use(morgan('combined'));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });
    
    // Mount chat completions router
    const chatRouter = chatCompletionsRouter({
      backendRouter: this.backendRouter,
      requestTransformer: this.requestTransformer,
      responseTransformer: this.responseTransformer,
      streamingHandler: this.streamingHandler
    });
    this.app.use('/v1', chatRouter);
    
    // Additional OpenAI-compatible endpoints (future)
    this.app.get('/v1/models', (req, res) => {
      // Return available models based on configured backends
      res.json({
        object: 'list',
        data: []
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      console.error('Gateway Error:', error);
      
      // Default error response
      const errorResponse = {
        error: {
          message: error.message || 'Internal server error',
          type: 'gateway_error',
          code: error.code || 'gateway_error'
        }
      };
      
      const statusCode = error.status || 500;
      res.status(statusCode).json(errorResponse);
    });
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: {
          message: `The requested resource ${req.originalUrl} was not found`,
          type: 'invalid_request_error',
          code: 'resource_not_found'
        }
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.config.port, () => {
        console.log(`Chromagent Gateway server running on port ${this.config.port}`);
        console.log(`Endpoint: http://localhost:${this.config.port}/v1/chat/completions`);
        resolve();
      });
      
      server.on('error', (error) => {
        console.error('Server error:', error);
        reject(error);
      });
      
      // Handle graceful shutdown
      process.on('SIGTERM', () => {
        console.log('Shutting down gracefully...');
        server.close(() => {
          console.log('Server closed.');
          process.exit(0);
        });
      });
    });
  }

  getApp(): Express {
    return this.app;
  }

  async close(): Promise<void> {
    // This would close the server; implementation depends on how the server instance is stored
    // For now, we'll assume the server is handled by the start method
  }
}