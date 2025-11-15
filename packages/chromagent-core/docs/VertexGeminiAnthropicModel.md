# VertexGeminiAnthropicModel

The `VertexGeminiAnthropicModel` class provides a bridge between the Anthropic API format and Google Vertex AI Gemini,
allowing you to use Gemini models with applications expecting an Anthropic-compatible interface.

## Configuration Options

The class accepts a configuration object with the following properties:

- `apiKey` (string, required): Your Google Vertex AI API key for authentication
- `model` (string, required): The model name to use for all requests (e.g., `gemini-1.5-pro`, `gemini-1.5-flash`)

## API Implementation

The class implements the `AnthropicModel` interface with the `message` method that accepts an `AnthropicMessageRequest`
and returns a `Promise<AnthropicMessageResponse>`.

### Supported Features

- **Message format**: Transforms Anthropic API format to Vertex Gemini API format
- **Image support**: Handles image content in messages
- **Tool use**: Supports function calling with tools (converted to Gemini function format)
- **Temperature control**: Maps Anthropic temperature to Gemini
- **Token limits**: Maps max_tokens to Gemini's maxOutputTokens
- **Stop sequences**: Maps Anthropic stop sequences to Gemini's stopSequences
- **System prompts**: Converts system prompts to Gemini systemInstruction format
- **Safety settings**: Includes default safety settings to block only high-risk content

## Usage Example

```typescript
import {VertexGeminiAnthropicModel} from "@chromagen/core";

// Create an instance with configuration
const vertexModel = new VertexGeminiAnthropicModel({
    apiKey: "YOUR_API_KEY_HERE",
    model: "gemini-1.5-pro"
});

// Create a request in Anthropic format
const request = {
    model: "unused-model", // This is ignored, the configured model is used
    max_tokens: 1024,
    temperature: 0.7,
    messages: [
        {
            role: "user",
            content: "Hello, how are you today?"
        }
    ]
};

// Send the message and receive a response
try {
    const response = await vertexModel.message(request);
    console.log("Response:", response.content[0].text);
} catch (error) {
    console.error("Error calling Vertex Gemini:", error);
}
```

## Advanced Usage with Images

```typescript
import {VertexGeminiAnthropicModel} from "@chromagen/core";

const vertexModel = new VertexGeminiAnthropicModel({
    apiKey: "YOUR_API_KEY_HERE",
    model: "gemini-1.5-pro" // A model that supports images
});

const request = {
    model: "unused-model",
    max_tokens: 512,
    messages: [
        {
            role: "user",
            content: [
                {
                    type: "text",
                    text: "What do you see in this image?"
                },
                {
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: "image/jpeg",
                        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" // Example base64 image
                    }
                }
            ]
        }
    ]
};

const response = await vertexModel.message(request);
console.log(response.content[0].text);
```

## Advanced Usage with Tools

```typescript
import {VertexGeminiAnthropicModel} from "@chromagen/core";

const vertexModel = new VertexGeminiAnthropicModel({
    apiKey: "YOUR_API_KEY_HERE",
    model: "gemini-1.5-pro" // Make sure to use a model that supports function calling
});

const request = {
    model: "unused-model",
    max_tokens: 1024,
    messages: [
        {
            role: "user",
            content: "What's the weather like in San Francisco? Can you tell me the current temperature?"
        }
    ],
    tools: [
        {
            name: "get_current_weather",
            description: "Get the current weather in a given location",
            input_schema: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "The city and state, e.g. San Francisco, CA"
                    },
                    unit: {
                        type: "string",
                        description: "The unit of temperature (celsius or fahrenheit)",
                        enum: ["celsius", "fahrenheit"]
                    }
                },
                required: ["location", "unit"]
            }
        }
    ]
};

const response = await vertexModel.message(request);
console.log("Response content:", response.content);
```

## Using System Prompts

```typescript
import {VertexGeminiAnthropicModel} from "@chromagen/core";

const vertexModel = new VertexGeminiAnthropicModel({
    apiKey: "YOUR_API_KEY_HERE",
    model: "gemini-1.5-pro"
});

const request = {
    model: "unused-model",
    max_tokens: 1024,
    system: "You are an expert assistant that responds in a concise and helpful manner.",
    messages: [
        {
            role: "user",
            content: "Can you explain quantum computing in simple terms?"
        }
    ]
};

const response = await vertexModel.message(request);
console.log(response.content[0].text);
```

## Important Notes

1. The `model` property in the AnthropicMessageRequest is ignored. The model specified in the configuration is used for
   all requests.
2. The implementation uses the Google Generative Language API endpoint (
   `https://generativelanguage.googleapis.com/v1beta/models/`) rather than the pure Vertex AI endpoint.
3. The API key is passed as a query parameter rather than using Google's standard authentication.
4. Safety settings are set to block only high-risk content by default.