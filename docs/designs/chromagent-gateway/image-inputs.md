# Image Inputs Support Design

## Overview

This document outlines the design for implementing image inputs in the chromagent-gateway. The gateway must support OpenAI-compatible image inputs in chat messages while properly transforming image data for various backend providers.

## Image Inputs Architecture

### Image Inputs Pipeline

The image inputs implementation follows this pipeline:

```
OpenAI Request (with images) → Image Extractor → Image Transformer → Backend Request
Backend Response → Response Transformer → OpenAI Response
```

### Core Image Inputs Components

#### 1. Image Schema

```typescript
// OpenAI-compatible image format in messages
interface OpenAIImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

// OpenAI text content
interface OpenAITextContent {
  type: 'text';
  text: string;
}

// Combined content type
type OpenAIContent = OpenAITextContent | OpenAIImageContent;
```

#### 2. Image Handler Interface

```typescript
interface ImageHandler {
  // Extract image data from OpenAI message format
 extractImages(message: OpenAIChatCompletionMessageParam): Array<{
    type: 'image_url';
    image_url: {
      url: string;
      detail?: 'auto' | 'low' | 'high';
    };
  }>;
  
  // Convert image URLs to backend-compatible format
  convertToBackendFormat(
    imageData: Array<{ url: string; detail?: string }>,
    backendType: BackendType
  ): Promise<any[]>;
  
  // Validate image content
  validateImageContent(imageContent: OpenAIImageContent): { valid: boolean; errors: string[] };
  
  // Check if backend supports images
  supportsImages(backendType: BackendType): boolean;
}
```

## Backend-Specific Image Implementations

### 1. Vertex Gemini Image Support

#### Gemini Image Format

Vertex Gemini uses inline data for images:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "What's in this image?"
        },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "base64_encoded_image_data_here"
          }
        }
      ]
    }
  ]
}
```

#### Gemini Image Handler Implementation

```typescript
class VertexGeminiImageHandler implements ImageHandler {
  async convertToBackendFormat(
    imageData: Array<{ url: string; detail?: string }>,
    backendType: BackendType
  ): Promise<any[]> {
    const imageParts: any[] = [];
    
    for (const img of imageData) {
      // Convert image URL to base64
      const base64Data = await this.urlToBase64(img.url);
      const mimeType = this.getMimeTypeFromUrl(img.url);
      
      imageParts.push({
        inlineData: {
          mimeType,
          data: base64Data
        }
      });
    }
    
    return imageParts;
  }
  
  extractImages(message: OpenAIChatCompletionMessageParam): Array<{
    type: 'image_url';
    image_url: {
      url: string;
      detail?: 'auto' | 'low' | 'high';
    };
  }> {
    if (typeof message.content === 'string') {
      return [];
    }
    
    if (Array.isArray(message.content)) {
      return message.content
        .filter(item => item.type === 'image_url')
        .map(item => item as any);
    }
    
    return [];
  }
  
 validateImageContent(imageContent: OpenAIImageContent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!imageContent.image_url?.url) {
      errors.push('Image URL is required');
    } else {
      try {
        new URL(imageContent.image_url.url);
      } catch {
        errors.push('Invalid image URL format');
      }
    }
    
    const validDetails = ['auto', 'low', 'high'];
    if (imageContent.image_url.detail && !validDetails.includes(imageContent.image_url.detail)) {
      errors.push(`Invalid detail value: ${imageContent.image_url.detail}. Must be one of: ${validDetails.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  supportsImages(backendType: BackendType): boolean {
    return backendType === 'vertex-gemini';
  }
  
  private async urlToBase64(url: string): Promise<string> {
    // If it's already a data URL, return as is
    if (url.startsWith('data:')) {
      return url.split(',')[1]; // Extract base64 part
    }
    
    // Fetch the image using fetch API
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    return base64;
  }
  
  private getMimeTypeFromUrl(url: string): string {
    if (url.startsWith('data:')) {
      return url.split(';')[0].split(':')[1];
    }
    
    if (url.includes('.jpg') || url.includes('.jpeg')) return 'image/jpeg';
    if (url.includes('.png')) return 'image/png';
    if (url.includes('.gif')) return 'image/gif';
    if (url.includes('.webp')) return 'image/webp';
    
    return 'image/jpeg'; // Default fallback
  }
}
```

### 2. Vertex Anthropic Image Support

#### Anthropic Image Format

Vertex Anthropic uses a different format for images:

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "base64_encoded_image_data_here"
          }
        }
      ]
    }
  ]
}
```

#### Anthropic Image Handler Implementation

```typescript
class VertexAnthropicImageHandler implements ImageHandler {
  async convertToBackendFormat(
    imageData: Array<{ url: string; detail?: string }>,
    backendType: BackendType
  ): Promise<any[]> {
    const imageBlocks: any[] = [];
    
    for (const img of imageData) {
      // Convert image URL to base64
      const base64Data = await this.urlToBase64(img.url);
      const mediaType = this.getMediaTypeFromUrl(img.url);
      
      imageBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data
        }
      });
    }
    
    return imageBlocks;
  }
  
  extractImages(message: OpenAIChatCompletionMessageParam): Array<{
    type: 'image_url';
    image_url: {
      url: string;
      detail?: 'auto' | 'low' | 'high';
    };
  }> {
    if (typeof message.content === 'string') {
      return [];
    }
    
    if (Array.isArray(message.content)) {
      return message.content
        .filter(item => item.type === 'image_url')
        .map(item => item as any);
    }
    
    return [];
  }
  
  validateImageContent(imageContent: OpenAIImageContent): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!imageContent.image_url?.url) {
      errors.push('Image URL is required');
    } else {
      try {
        new URL(imageContent.image_url.url);
      } catch {
        errors.push('Invalid image URL format');
      }
    }
    
    // Anthropic doesn't support the detail parameter
    if (imageContent.image_url.detail) {
      errors.push('Anthropic does not support the detail parameter for images');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
 supportsImages(backendType: BackendType): boolean {
    return backendType === 'vertex-anthropic';
  }
  
  private async urlToBase64(url: string): Promise<string> {
    // If it's already a data URL, return as is
    if (url.startsWith('data:')) {
      return url.split(',')[1]; // Extract base64 part
    }
    
    // Fetch the image using fetch API
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    return base64;
  }
  
  private getMediaTypeFromUrl(url: string): string {
    if (url.startsWith('data:')) {
      const mimeType = url.split(';')[0].split(':')[1];
      // Anthropic expects specific media type format
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'image/jpeg';
      if (mimeType.includes('png')) return 'image/png';
      if (mimeType.includes('gif')) return 'image/gif';
      if (mimeType.includes('webp')) return 'image/webp';
    }
    
    if (url.includes('.jpg') || url.includes('.jpeg')) return 'image/jpeg';
    if (url.includes('.png')) return 'image/png';
    if (url.includes('.gif')) return 'image/gif';
    if (url.includes('.webp')) return 'image/webp';
    
    return 'image/jpeg'; // Default fallback
  }
}
```

## Image Processing Service

### Main Image Processing Service

```typescript
class ImageProcessingService {
  private handlers: Map<BackendType, ImageHandler>;
  private maxSize: number; // Max image size in bytes (e.g., 20MB)
  
  constructor(maxSize: number = 20 * 1024 * 1024) { // 20MB default
    this.handlers = new Map();
    this.handlers.set('vertex-gemini', new VertexGeminiImageHandler());
    this.handlers.set('vertex-anthropic', new VertexAnthropicImageHandler());
    this.maxSize = maxSize;
  }
  
 // Check if backend supports images
  supportsImages(backendType: BackendType): boolean {
    const handler = this.handlers.get(backendType);
    return handler ? handler.supportsImages(backendType) : false;
  }
  
  // Extract images from OpenAI message format
  extractImages(message: OpenAIChatCompletionMessageParam): Array<{
    type: 'image_url';
    image_url: {
      url: string;
      detail?: 'auto' | 'low' | 'high';
    };
  }> {
    const handler = this.handlers.get('vertex-gemini'); // Use Gemini handler for extraction as it's common
    if (!handler) {
      return [];
    }
    
    return handler.extractImages(message);
  }
  
  // Convert images to backend format
  async convertToBackendFormat(
    imageData: Array<{ url: string; detail?: string }>,
    backendType: BackendType
 ): Promise<any[]> {
    const handler = this.handlers.get(backendType);
    if (!handler) {
      throw new Error(`No image handler for backend type: ${backendType}`);
    }
    
    // Validate image sizes before processing
    await this.validateImageSizes(imageData);
    
    return handler.convertToBackendFormat(imageData, backendType);
  }
  
  // Validate image content
  validateImageContent(imageContent: OpenAIImageContent, backendType: BackendType): { valid: boolean; errors: string[] } {
    const handler = this.handlers.get(backendType);
    if (!handler) {
      return { valid: false, errors: [`No image handler for backend type: ${backendType}`] };
    }
    
    return handler.validateImageContent(imageContent);
  }
  
  // Validate image sizes to prevent excessive memory usage
  private async validateImageSizes(imageData: Array<{ url: string; detail?: string }>): Promise<void> {
    for (const img of imageData) {
      if (img.url.startsWith('data:')) {
        // For data URLs, check base64 size
        const base64Data = img.url.split(',')[1];
        const size = Buffer.byteLength(base64Data, 'base64');
        
        if (size > this.maxSize) {
          throw new Error(`Image exceeds maximum size of ${this.maxSize} bytes`);
        }
      } else {
        // For remote URLs, fetch headers to check content length
        const response = await fetch(img.url, { method: 'HEAD' });
        const contentLength = response.headers.get('content-length');
        
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (size > this.maxSize) {
            throw new Error(`Image exceeds maximum size of ${this.maxSize} bytes`);
          }
        }
        // If content-length is not available, we'll check the actual size during processing
      }
    }
  }
  
  // Process images in a message and convert to backend format
  async processMessageImages(
    message: OpenAIChatCompletionMessageParam,
    backendType: BackendType
 ): Promise<{ textContent: string | null; imageParts: any[] }> {
    let textContent: string | null = null;
    const imageParts: any[] = [];
    
    if (typeof message.content === 'string') {
      // Simple text message
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      // Mixed content message
      for (const item of message.content) {
        if (item.type === 'text') {
          textContent = item.text;
        } else if (item.type === 'image_url') {
          // Validate image content
          const validation = this.validateImageContent(item, backendType);
          if (!validation.valid) {
            throw new Error(`Invalid image content: ${validation.errors.join(', ')}`);
          }
          
          // Convert to backend format
          const backendImages = await this.convertToBackendFormat(
            [{ url: item.image_url.url, detail: item.image_url.detail }],
            backendType
          );
          
          imageParts.push(...backendImages);
        }
      }
    }
    
    return { textContent, imageParts };
  }
}
```

## Integration with Request Transformer

### Request Transformer Integration

```typescript
class RequestTransformer {
  private imageService: ImageProcessingService;
  
  constructor() {
    this.imageService = new ImageProcessingService();
  }
  
  async transformToBackend(
    openaiRequest: OpenAIChatCompletionCreateParams,
    backendType: BackendType
  ): Promise<any> {
    const backendRequest: any = {
      model: openaiRequest.model,
      generationConfig: {
        temperature: openaiRequest.temperature,
        topP: openaiRequest.top_p,
        maxOutputTokens: openaiRequest.max_tokens
      }
    };
    
    // Process messages with potential image content
    backendRequest.contents = [];
    
    for (const message of openaiRequest.messages) {
      // Check if message contains images
      const images = this.imageService.extractImages(message);
      
      if (images.length > 0) {
        // Verify backend supports images
        if (!this.imageService.supportsImages(backendType)) {
          throw new Error(`Backend ${backendType} does not support image inputs`);
        }
        
        // Process the message with images
        const processed = await this.imageService.processMessageImages(message, backendType);
        
        // Create backend-specific message format
        switch (backendType) {
          case 'vertex-gemini':
            // For Gemini, convert role 'assistant' to 'model'
            const role = message.role === 'assistant' ? 'model' : message.role;
            
            const parts = [];
            if (processed.textContent) {
              parts.push({ text: processed.textContent });
            }
            parts.push(...processed.imageParts);
            
            backendRequest.contents.push({
              role,
              parts
            });
            break;
            
          case 'vertex-anthropic':
            // Anthropic handles images differently in the content array
            const contentBlocks = [];
            if (processed.textContent) {
              contentBlocks.push({ type: 'text', text: processed.textContent });
            }
            contentBlocks.push(...processed.imageParts);
            
            backendRequest.messages = backendRequest.messages || [];
            backendRequest.messages.push({
              role: message.role,
              content: contentBlocks
            });
            break;
        }
      } else {
        // Handle text-only message
        switch (backendType) {
          case 'vertex-gemini':
            const role = message.role === 'assistant' ? 'model' : message.role;
            backendRequest.contents.push({
              role,
              parts: [{ text: message.content as string }]
            });
            break;
            
          case 'vertex-anthropic':
            backendRequest.messages = backendRequest.messages || [];
            backendRequest.messages.push({
              role: message.role,
              content: message.content as string
            });
            break;
        }
      }
    }
    
    // Transform tools if present
    if (openaiRequest.tools) {
      backendRequest.tools = this.toolService.transformToolsToBackend(
        openaiRequest.tools,
        backendType
      );
    }
    
    // Transform tool choice if present
    if (openaiRequest.tool_choice) {
      const toolConfig = this.toolService.transformToolChoiceToBackend(
        openaiRequest.tool_choice,
        backendType
      );
      
      switch (backendType) {
        case 'vertex-gemini':
          if (toolConfig) {
            backendRequest.toolConfig = toolConfig;
          }
          break;
        case 'vertex-anthropic':
          if (toolConfig) {
            backendRequest.tool_choice = toolConfig;
          }
          break;
      }
    }
    
    return backendRequest;
  }
}
```

## Image Processing Middleware

### Express Middleware for Image Processing

```typescript
class ImageProcessingMiddleware {
  private imageService: ImageProcessingService;
  
  constructor() {
    this.imageService = new ImageProcessingService();
  }
  
  // Middleware to validate image requests
  validateImageRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if request contains image content
      if (req.body && req.body.messages) {
        for (const message of req.body.messages) {
          if (typeof message.content !== 'string' && Array.isArray(message.content)) {
            for (const item of message.content) {
              if (item.type === 'image_url') {
                // Validate the image content
                const backendType = this.determineBackend(req.body); // Implementation needed
                const validation = this.imageService.validateImageContent(item, backendType);
                
                if (!validation.valid) {
                  return res.status(400).json({
                    error: {
                      message: `Invalid image content: ${validation.errors.join(', ')}`,
                      type: 'invalid_request_error',
                      code: 'invalid_image_content'
                    }
                  });
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
  
  // Helper to determine backend type from request
 private determineBackend(request: any): BackendType {
    // Implementation to determine backend based on model or other factors
    // This is a simplified version
    return 'vertex-gemini'; // Default for now
  }
}
```

## Error Handling for Images

### Image-Specific Error Handling

```typescript
class ImageErrorHandler {
  // Transform image-related errors to OpenAI format
 transformImageError(
    error: any,
    backendType: BackendType
  ): {
    status: number;
    error: {
      message: string;
      type: string;
      code?: string;
    };
  } {
    let status = 400; // Default to bad request
    let message = 'Image processing error';
    let type = 'image_error';
    let code: string | undefined;
    
    if (error.message) {
      message = error.message;
      
      if (message.includes('size') || message.includes('exceeds')) {
        status = 413; // Payload too large
        type = 'invalid_image_error';
        code = 'image_too_large';
      } else if (message.includes('URL') || message.includes('fetch')) {
        status = 400;
        type = 'invalid_image_url';
        code = 'invalid_image_url';
      } else if (message.includes('base64') || message.includes('encoding')) {
        status = 400;
        type = 'invalid_image_format';
        code = 'invalid_image_format';
      }
    }
    
    return {
      status,
      error: {
        message,
        type,
        code
      }
    };
  }
}
```

## Performance Considerations

### 1. Memory Management

- Implement image size limits to prevent memory exhaustion
- Use streaming for large image downloads
- Efficient base64 encoding/decoding

### 2. Network Efficiency

- Cache processed images when possible
- Use HEAD requests to check image sizes before downloading
- Implement proper error handling for network failures

### 3. Processing Efficiency

- Parallel processing of multiple images in a message
- Efficient format conversion algorithms
- Proper cleanup of temporary data

### 4. Bandwidth Optimization

- Consider image compression before processing
- Implement proper timeout handling for image downloads
- Support for various image formats efficiently

## Security Considerations

### 1. Input Validation

- Validate image URLs to prevent SSRF attacks
- Check image content types and sizes
- Sanitize image data before processing

### 2. Access Control

- Ensure proper authentication for image URLs
- Prevent access to internal resources via image URLs
- Implement proper error messages that don't leak information

This image inputs implementation provides comprehensive support for image processing across different backend providers while maintaining OpenAI compatibility and ensuring security and performance.