import { Request, Response, NextFunction } from 'express';
import { ImageProcessingService } from '../utils/image';

// CORS middleware is handled via the express-cors package, so we'll implement other middleware
export class RequestValidationMiddleware {
  private imageService: ImageProcessingService;
  
  constructor() {
    this.imageService = new ImageProcessingService();
  }
  
  // Middleware to validate requests with image content
  validateImageRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if request contains image content
      if (req.body && req.body.messages) {
        for (const message of req.body.messages) {
          if (typeof message.content !== 'string' && Array.isArray(message.content)) {
            for (const item of message.content) {
              if (item.type === 'image_url') {
                // Validate the image content
                const validation = this.imageService.validateImageContent(item);
                
                if (!validation.valid) {
                  res.status(400).json({
                    error: {
                      message: `Invalid image content: ${validation.errors.join(', ')}`,
                      type: 'invalid_request_error',
                      code: 'invalid_image_content'
                    }
                  });
                  return; // Ensure function returns after sending response
                }
              }
            }
          }
        }
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
  
  // Middleware to validate required fields in chat completion requests
  validateChatCompletionRequest = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { model, messages } = req.body;
      
      // Validate required fields
      if (!model) {
        res.status(400).json({
          error: {
            message: 'Missing required field: model',
            type: 'invalid_request_error',
            code: 'missing_model'
          }
        });
        return; // Ensure function returns after sending response
      }
      
      if (!messages) {
        res.status(400).json({
          error: {
            message: 'Missing required field: messages',
            type: 'invalid_request_error',
            code: 'missing_messages'
          }
        });
        return; // Ensure function returns after sending response
      }
      
      if (!Array.isArray(messages)) {
        res.status(400).json({
          error: {
            message: 'Messages must be an array',
            type: 'invalid_request_error',
            code: 'invalid_messages'
          }
        });
        return; // Ensure function returns after sending response
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Export an instance of the middleware class
export const requestValidationMiddleware = new RequestValidationMiddleware();