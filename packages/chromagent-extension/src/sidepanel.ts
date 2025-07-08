import { configService } from "./service/configService";

document.addEventListener('DOMContentLoaded', async () => {
  const modelDisplay = document.getElementById('model-display') as HTMLSpanElement;
  const settingsButton = document.getElementById('settings-button') as HTMLButtonElement;
  const clearHistoryButton = document.getElementById('clear-history-button') as HTMLButtonElement;
  const chatPage = document.getElementById('chat-page') as HTMLDivElement;
  const configPage = document.getElementById('config-page') as HTMLDivElement;

  const modelTypeSelect = document.getElementById('model-type') as HTMLSelectElement;
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const apiBaseInput = document.getElementById('api-base') as HTMLInputElement;
  const modelNameInput = document.getElementById('model-name') as HTMLInputElement;

  const chatContainer = document.getElementById('chat-container') as HTMLDivElement;
  const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
  const sendButton = document.getElementById('send-button') as HTMLButtonElement;

  // Load saved configuration
  let selectedModelType = await configService.get('selectedModelType') || 'gemini';
  let apiKey = await configService.get('apiKey') || '';
  let apiBase = await configService.get('apiBase') || '';
  let modelName = await configService.get('modelName') || 'gemini-2.5-flash';

  modelTypeSelect.value = selectedModelType;
  apiKeyInput.value = apiKey;
  apiBaseInput.value = apiBase;
  modelNameInput.value = modelName;

  modelDisplay.textContent = modelName; // Initial display

  // Event listeners for config changes
  modelTypeSelect.addEventListener('change', async () => {
    selectedModelType = modelTypeSelect.value;
    await configService.set('selectedModelType', 'Selected Model Type', selectedModelType);
    modelDisplay.textContent = modelName; // Update display
  });

  apiKeyInput.addEventListener('change', async () => {
    apiKey = apiKeyInput.value;
    await configService.set('apiKey', 'API Key', apiKey);
  });

  apiBaseInput.addEventListener('change', async () => {
    apiBase = apiBaseInput.value;
    await configService.set('apiBase', 'API Base', apiBase);
  });

  modelNameInput.addEventListener('change', async () => {
    modelName = modelNameInput.value;
    await configService.set('modelName', 'Model Name', modelName);
    modelDisplay.textContent = modelName; // Update display
  });

  // Toggle between chat and config pages
  settingsButton.addEventListener('click', () => {
    if (chatPage.style.display === 'none') {
      chatPage.style.display = 'flex';
      configPage.style.display = 'none';
    } else {
      chatPage.style.display = 'none';
      configPage.style.display = 'flex';
    }
  });

  // Event listener for clear history button
  clearHistoryButton.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CHAT_HISTORY' });
  });

  const displayMessage = (message: string, sender: 'user' | 'model', imageUrl?: string) => {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    if (imageUrl) {
      const imgElement = document.createElement('img');
      imgElement.src = imageUrl;
      messageElement.appendChild(imgElement);
    }
    const textElement = document.createElement('p');
    textElement.textContent = message;
    messageElement.appendChild(textElement);
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  };

  chatInput.addEventListener('paste', (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              if (base64Image) {
                displayMessage('Image pasted:', 'user', base64Image);
                // Send image to background script
                chrome.runtime.sendMessage({
                  type: 'LLM_CHAT',
                  payload: { type: 'image', data: base64Image }
                });
              } else {
                console.error("Pasted image data is empty.");
              }
            };
            reader.readAsDataURL(file);
          }
          event.preventDefault();
          break;
        }
      }
    }
  });

  sendButton.addEventListener('click', async () => {
    const userMessage = chatInput.value.trim();

    if (!apiKey) {
      displayMessage('Please enter your API Key.', 'model');
      return;
    }

    if (!userMessage) {
      displayMessage('Please type a message or paste an image.', 'model');
      return;
    }

    displayMessage(userMessage, 'user');
    chatInput.value = ''; // Clear input after sending

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LLM_CHAT',
        payload: { type: 'text', text: userMessage }
      });
      if (response.success) {
        displayMessage(response.response, 'model');
      } else {
        displayMessage(`Error: ${response.error}`, 'model');
      }
    } catch (error) {
      console.error("Error sending message to background:", error);
      displayMessage(`Error: ${(error as Error).message}`, 'model');
    }
  });

  // Listen for messages from the background script (e.g., chat history updates)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHAT_HISTORY_UPDATE') {
      // Clear existing messages and re-render from history
      chatContainer.innerHTML = '';
      message.history.forEach((msg: any) => {
        if (msg.type === 'human') {
          if (msg.content.type === 'text') {
            displayMessage(msg.content.text, 'user');
          } else if (msg.content.type === 'image') {
            displayMessage('Image pasted:', 'user', msg.content.data);
          }
        } else if (msg.type === 'ai') {
          displayMessage(msg.content, 'model');
        }
      });
    }
  });

  // Request initial chat history when side panel opens
  chrome.runtime.sendMessage({ type: 'REQUEST_CHAT_HISTORY' });
});