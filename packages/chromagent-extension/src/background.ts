
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { navigateTool, tabResource } from './service/tools';
import { getChatModel } from './service/modelProvider';
import { configService } from './service/configService';

interface ChatMessage {
  type: 'human' | 'ai';
  content: string | Array<{ type: 'text', text: string } | { type: 'image_url', image_url: string }>;
}

// Function to send chat history updates to the side panel
const sendChatHistoryUpdate = async () => {
  const chatHistory = await chrome.storage.local.get(['chatHistory']);
  chrome.runtime.sendMessage({
    type: 'CHAT_HISTORY_UPDATE',
    history: chatHistory.chatHistory || [],
  });
};

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'CALL_TOOL') {
    if (message.toolName === 'navigate') {
      const navigatePayload = message.payload as { url: string };
      navigateTool.func(navigatePayload.url)
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: (error as any).message }));
      return true;
    } else if (message.toolName === 'list_tabs') {
      tabResource.func('') // Pass an empty string as dummy argument
        .then(result => sendResponse({ success: true, result }))
        .catch(error => sendResponse({ success: false, error: (error as any).message }));
      return true;
    }
  } else if (message.type === 'LLM_CHAT') {
    try {
      let chatHistory = (await chrome.storage.local.get(['chatHistory'])).chatHistory || [];

      const userMessageContent = message.payload.type === 'text' ? message.payload.text : [{ type: 'image_url', image_url: message.payload.data }];
      chatHistory.push({ type: 'human', content: userMessageContent });
      await chrome.storage.local.set({ chatHistory });
      await sendChatHistoryUpdate();

      const selectedModelType = await configService.get('selectedModelType') || 'gemini';
      const apiKey = await configService.get('apiKey') || '';
      const apiBase = await configService.get('apiBase') || '';
      const modelName = await configService.get('modelName') || 'gemini-2.5-flash';

      const chatModel = getChatModel(selectedModelType, apiKey, apiBase, modelName);

      const langchainChatHistory: BaseMessage[] = chatHistory.map((msg: ChatMessage) => {
        if (msg.type === 'human') {
          if (typeof msg.content === 'string') {
            return new HumanMessage(msg.content);
          } else {
            // Filter out empty image_url parts and empty text parts
            const filteredContent = msg.content.filter(part => {
              if (part.type === 'image_url') {
                return part.image_url && part.image_url.length > 0;
              } else if (part.type === 'text') {
                return part.text && part.text.length > 0;
              }
              return true;
            });

            if (filteredContent.length === 0) {
              // If all parts were filtered out, create a HumanMessage with a placeholder
              return new HumanMessage("User input was empty or invalid.");
            } else {
              return new HumanMessage({ content: filteredContent });
            }
          }
        } else {
          return new AIMessage(msg.content as string);
        }
      });

      let response;
      if (chatModel.bindTools) {
        const chatModelWithTools = chatModel.bindTools([navigateTool, tabResource]);
        response = await chatModelWithTools.invoke(langchainChatHistory);
      } else {
        // Fallback if bindTools is not available (shouldn't happen with current LangChain versions)
        response = await chatModel.invoke(langchainChatHistory);
      }

      if (response && response.content) {
        chatHistory.push({ type: 'ai', content: response.content as string });
        await chrome.storage.local.set({ chatHistory });
        await sendChatHistoryUpdate();

        sendResponse({ success: true, response: response.content });
      } else {
        sendResponse({ success: false, error: "Model response was empty or invalid." });
      }
    } catch (error) {
      console.error("Error invoking model:", error);
      sendResponse({ success: false, error: (error as Error).message });
    }
    return true;
  } else if (message.type === 'REQUEST_CHAT_HISTORY') {
    await sendChatHistoryUpdate();
  } else if (message.type === 'CLEAR_CHAT_HISTORY') {
    await chrome.storage.local.set({ chatHistory: [] });
    await sendChatHistoryUpdate();
  }
});
