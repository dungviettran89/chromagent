import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export function getChatModel(modelType: string, apiKey: string, apiBase: string, modelName: string): BaseChatModel {
  if (modelType === 'gemini') {
    return new ChatGoogleGenerativeAI({
      apiKey: apiKey,
      model: modelName,
    });
  } else if (modelType === 'openai') {
    return new ChatOpenAI({
      apiKey: apiKey,
      modelName: modelName,
      configuration: { baseURL: apiBase || undefined },
    });
  } else {
    throw new Error('Invalid model type configured.');
  }
}