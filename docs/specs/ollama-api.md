# Ollama API Reference

The Ollama API provides a simple way to run and interact with large language models locally.

**Base URL**: `http://localhost:11434/api`

## Endpoints

### Generate a completion

Generate a response for a given prompt with a provided model.

**Endpoint**: `POST /api/generate`

**Parameters**:
- `model`: (required) The model name.
- `prompt`: (required) The prompt to generate a response for.
- `stream`: (optional) If `false` the response will be returned as a single response object, rather than a stream of objects. Default is `true`.
- `format`: (optional) The format to return a response in. Currently the only accepted value is `json`.
- `options`: (optional) Additional model parameters listed in the documentation for the Modelfile such as `temperature`.
- `system`: (optional) System message to (overrides what is defined in the `Modelfile`).
- `template`: (optional) The prompt template to use (overrides what is defined in the `Modelfile`).
- `context`: (optional) The context parameter returned from a previous request to `/generate`, this can be used to keep a short conversational memory.
- `raw`: (optional) If `true` no formatting will be applied to the prompt. You may choose to use the `raw` parameter if you are specifying a full templated prompt in your request to the API.
- `keep_alive`: (optional) Controls how long the model will stay loaded into memory following the request (default: 5m).

**Example Request**:
```json
{
  "model": "llama3",
  "prompt": "Why is the sky blue?",
  "stream": false
}
```

### Chat with a model

Generate the next message in a chat with a provided model.

**Endpoint**: `POST /api/chat`

**Parameters**:
- `model`: (required) The model name.
- `messages`: (required) The messages of the chat, this can be used to keep a chat memory.
- `stream`: (optional) If `false` the response will be returned as a single response object, rather than a stream of objects. Default is `true`.
- `format`: (optional) The format to return a response in. Currently the only accepted value is `json`.
- `options`: (optional) Additional model parameters.
- `keep_alive`: (optional) Controls how long the model will stay loaded into memory following the request (default: 5m).

**Message Object**:
- `role`: The role of the message, either `system`, `user`, `assistant`, or `tool`.
- `content`: The content of the message.
- `images`: (optional) A list of base64-encoded images (for multimodal models such as llava).

**Example Request**:
```json
{
  "model": "llama3",
  "messages": [
    {
      "role": "user",
      "content": "why is the sky blue?"
    }
  ],
  "stream": false
}
```

### Create a Model

Create a model from a Modelfile.

**Endpoint**: `POST /api/create`

**Parameters**:
- `name`: (required) Name of the model to create.
- `modelfile`: (optional) Contents of the Modelfile.
- `stream`: (optional) If `false` the response will be returned as a single response object, rather than a stream of objects. Default is `true`.
- `path`: (optional) Path to the Modelfile.

**Example Request**:
```json
{
  "name": "mario",
  "modelfile": "FROM llama3\nSYSTEM You are mario from Super Mario Bros."
}
```

### List Local Models

List models that are available locally.

**Endpoint**: `GET /api/tags`

**Example Response**:
```json
{
  "models": [
    {
      "name": "llama3:latest",
      "modified_at": "2023-11-04T14:56:49.277302595-07:00",
      "size": 3826793677,
      "digest": "fe938a131f40e6f6d40083c9f0f430a515233eb2edaa6d72eb85c50d64f2300e",
      "details": {
        "format": "gguf",
        "family": "llama",
        "families": null,
        "parameter_size": "7B",
        "quantization_level": "Q4_0"
      }
    }
  ]
}
```

### Show Model Information

Show information about a model including details, modelfile, template, parameters, license, and system message.

**Endpoint**: `POST /api/show`

**Parameters**:
- `name`: (required) Name of the model to show.

**Example Request**:
```json
{
  "name": "llama3"
}
```

### Copy a Model

Copy a model. Creates a model with another name from an existing model.

**Endpoint**: `POST /api/copy`

**Parameters**:
- `source`: (required) Name of the model to copy.
- `destination`: (required) Name of the new model.

**Example Request**:
```json
{
  "source": "llama3",
  "destination": "llama3-backup"
}
```

### Delete a Model

Delete a model and its data.

**Endpoint**: `DELETE /api/delete`

**Parameters**:
- `name`: (required) Name of the model to delete.

**Example Request**:
```json
{
  "name": "llama3:13b"
}
```

### Pull a Model

Download a model from the ollama library. Cancelled pulls are resumed from where they left off, and multiple calls will share the same download progress.

**Endpoint**: `POST /api/pull`

**Parameters**:
- `name`: (required) Name of the model to pull.
- `insecure`: (optional) Allow insecure connections to the library. Only use this if you are pulling from your own library during development.
- `stream`: (optional) If `false` the response will be returned as a single response object, rather than a stream of objects. Default is `true`.

**Example Request**:
```json
{
  "name": "llama3"
}
```

### Push a Model

Upload a model to a model library. Requires registering for ollama.ai and adding a public key first.

**Endpoint**: `POST /api/push`

**Parameters**:
- `name`: (required) Name of the model to push in the form of `<namespace>/<model>:<tag>`.
- `insecure`: (optional) Allow insecure connections to the library. Only use this if you are pushing to your own library during development.
- `stream`: (optional) If `false` the response will be returned as a single response object, rather than a stream of objects. Default is `true`.

**Example Request**:
```json
{
  "name": "mattw/pygmalion:latest"
}
```

### Generate Embeddings

Generate embeddings from a model.

**Endpoint**: `POST /api/embeddings`

**Parameters**:
- `model`: (required) Name of the model to generate embeddings from.
- `prompt`: (required) The text to generate embeddings for.
- `options`: (optional) Additional model parameters.
- `keep_alive`: (optional) Controls how long the model will stay loaded into memory following the request (default: 5m).

**Example Request**:
```json
{
  "model": "llama3",
  "prompt": "Here is an article about llamas..."
}
```
