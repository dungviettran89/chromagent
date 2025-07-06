
import { DynamicTool } from "@langchain/core/tools";

export const navigateTool = new DynamicTool({
  name: "navigate",
  description: "Opens a new browser tab with the specified URL. Input should be a valid URL string.",
  func: async (url: string) => {
    try {
      await chrome.tabs.create({ url: url });
      return `Successfully navigated to ${url}`;
    } catch (error: any) {
      return `Failed to navigate to ${url}: ${error.message}`;
    }
  },
});

export const tabResource = new DynamicTool({
  name: "list_tabs",
  description: "Lists all currently opened browser tabs, including their URLs and titles. Returns an array of objects, each with 'url' and 'title' properties.",
  func: async (_: string) => { // Accepts a string, but ignores it
    try {
      const tabs = await chrome.tabs.query({});
      return JSON.stringify(tabs.map(tab => ({ url: tab.url, title: tab.title })));
    } catch (error: any) {
      return `Failed to list tabs: ${error.message}`;
    }
  },
});
