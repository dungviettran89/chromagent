import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { RequestHandler } from "express";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

/**
 * Creates an Open AI compatible chat completions endpoint using the provided model.
 * Image are supported, but streaming and tool calls are not yet implemented.
 * @param model model - The chat model to use for generating completions.
 */
export const createChatCompletions = (model: BaseChatModel): RequestHandler => {
  return (async (req, res) => {
    try {
      const { messages, stream } = req.body;

      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({ error: "Messages not found in request body." });
        return;
      }

      const langchainMessages: BaseMessage[] = messages.map((msg: any) => {
        let content;
        if (Array.isArray(msg.content)) {
          content = msg.content.map((part: any) => {
            if (part.type === "text") {
              return { type: "text", text: part.text };
            } else if (part.type === "image_url") {
              return { type: "image_url", image_url: { url: part.image_url.url } };
            }
            throw new Error(`Unsupported content part type: ${part.type}`);
          });
        } else {
          content = msg.content;
        }

        if (msg.role === "user") {
          return new HumanMessage({ content: content });
        } else if (msg.role === "assistant") {
          return new AIMessage({ content: content });
        }
        throw new Error(`Unsupported role: ${msg.role}`);
      });

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamIterator = await model.stream(langchainMessages);

        for await (const chunk of streamIterator) {
          const streamResponse = {
            id: `chatcmpl-${Math.random().toString(36).substring(2, 15)}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: model.lc_kwargs.model_name || "unknown-model",
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: chunk.content,
                },
                finish_reason: null, // Set to "stop" on final chunk
              },
            ],
          };
          res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        const response = await model.invoke(langchainMessages);

        const openaiResponse = {
          id: `chatcmpl-${Math.random().toString(36).substring(2, 15)}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: model.lc_kwargs.model_name || "unknown-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: response.content,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 0, // Not accurately calculated by BaseChatModel
            completion_tokens: 0, // Not accurately calculated by BaseChatModel
            total_tokens: 0, // Not accurately calculated by BaseChatModel
          },
        };
        res.json(openaiResponse);
      }
    } catch (error: any) {
      console.error("Error in createChatCompletions:", error);
      res.status(500).json({ error: error.message || "An unknown error occurred." });
    }
  });
};