/**
 * Type definitions for Google Vertex Generation API (Gemini)
 */

// Content types
export type VertexPart = VertexTextPart | VertexInlineDataPart | VertexFileDataPart;
export interface VertexTextPart {
  text: string;
}
export interface VertexInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string; // base64 encoded
  };
}
export interface VertexFileDataPart {
  fileData: {
    mimeType: string;
    fileUri: string;
  };
}

export interface VertexContent {
  role: 'user' | 'model';
  parts: VertexPart[];
}

// Request parameters
export interface VertexGenerateContentRequest {
  contents: VertexContent[];
  systemInstruction?: VertexContent;
  generationConfig?: VertexGenerationConfig;
  safetySettings?: VertexSafetySetting[];
  tools?: VertexTool[];
  toolConfig?: VertexToolConfig;
  cachedContent?: string; // resource name of the cached content
}

export interface VertexGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
  responseSchema?: object;
}

export interface VertexSafetySetting {
  category: 
    | 'HARM_CATEGORY_DEROGATORY'
    | 'HARM_CATEGORY_TOXICITY'
    | 'HARM_CATEGORY_VIOLENCE'
    | 'HARM_CATEGORY_SEXUAL'
    | 'HARM_CATEGORY_MEDICAL'
    | 'HARM_CATEGORY_DANGEROUS'
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  threshold: 
    | 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
    | 'BLOCK_LOW_AND_ABOVE'
    | 'BLOCK_MEDIUM_AND_ABOVE'
    | 'BLOCK_ONLY_HIGH'
    | 'BLOCK_NONE';
  method?: 'SAFETY_METHOD_UNSPECIFIED' | 'SERVER';
}

export interface VertexTool {
  functionDeclarations?: VertexFunctionDeclaration[];
  codeExecution?: object;
}

export interface VertexFunctionDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface VertexToolConfig {
  functionCallingConfig?: VertexFunctionCallingConfig;
}

export interface VertexFunctionCallingConfig {
  mode?: 'MODE_UNSPECIFIED' | 'AUTO' | 'ANY' | 'NONE';
  allowedFunctionNames?: string[];
}

// Response types
export interface VertexGenerateContentResponse {
  candidates?: VertexContent[];
  promptFeedback?: VertexPromptFeedback;
  usageMetadata?: VertexUsageMetadata;
}

export interface VertexPromptFeedback {
  blockReason?: 'BLOCKED_REASON_UNSPECIFIED' | 'SAFETY' | 'OTHER';
  safetyRatings?: VertexSafetyRating[];
}

export interface VertexSafetyRating {
  category: 
    | 'HARM_CATEGORY_DEROGATORY'
    | 'HARM_CATEGORY_TOXICITY'
    | 'HARM_CATEGORY_VIOLENCE'
    | 'HARM_CATEGORY_SEXUAL'
    | 'HARM_CATEGORY_MEDICAL'
    | 'HARM_CATEGORY_DANGEROUS'
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT';
  probability: 'HARM_PROBABILITY_UNSPECIFIED' | 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';
  blocked?: boolean;
}

export interface VertexUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

// Error response
export interface VertexAIAPIError {
  code: number;
  message: string;
  status: string;
}