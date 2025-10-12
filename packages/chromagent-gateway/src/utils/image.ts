import fetch from 'node-fetch';
import { OpenAIChatCompletionMessageParam } from '../types';

export interface ImageHandler {
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
    backendType: string
  ): Promise<any[]>;
  
  // Validate image content
  validateImageContent(imageContent: any): { valid: boolean; errors: string[] };
  
  // Check if backend supports images
  supportsImages(backendType: string): boolean;
}

export class ImageProcessingService implements ImageHandler {
  private maxSize: number; // Max image size in bytes (e.g., 20MB)
  
  constructor(maxSize: number = 20 * 1024 * 1024) { // 20MB default
    this.maxSize = maxSize;
  }
  
  // Check if backend supports images
  supportsImages(backendType: string): boolean {
    return ['vertex-gemini', 'vertex-anthropic', 'ollama'].includes(backendType);
  }
  
  // Extract images from OpenAI message format
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
  
  // Convert images to backend format
  async convertToBackendFormat(
    imageData: Array<{ url: string; detail?: string }>,
    backendType: string
  ): Promise<any[]> {
    // Validate image sizes before processing
    await this.validateImageSizes(imageData);
    
    const imageParts: any[] = [];
    
    for (const img of imageData) {
      // Convert image URL to base64
      const base64Data = await this.urlToBase64(img.url);
      const mimeType = this.getMimeTypeFromUrl(img.url);
      
      switch (backendType) {
        case 'vertex-gemini':
          imageParts.push({
            inlineData: {
              mimeType,
              data: base64Data
            }
          });
          break;
          
        case 'vertex-anthropic':
          imageParts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64Data
            }
          });
          break;
          
        case 'ollama':
          // For Ollama, we just return the base64 image data
          imageParts.push(base64Data);
          break;
          
        default:
          throw new Error(`No image handler for backend type: ${backendType}`);
      }
    }
    
    return imageParts;
  }
  
  // Validate image content
  validateImageContent(imageContent: any): { valid: boolean; errors: string[] } {
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
    
    // Check detail value
    const validDetails = ['auto', 'low', 'high'];
    if (imageContent.image_url.detail && !validDetails.includes(imageContent.image_url.detail)) {
      errors.push(`Invalid detail value: ${imageContent.image_url.detail}. Must be one of: ${validDetails.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
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
    backendType: string
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
          textContent = item.text || null;
        } else if (item.type === 'image_url' && item.image_url) {
          // Validate image content
          const validation = this.validateImageContent(item);
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