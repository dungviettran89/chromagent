# Chromagent CLI

A simple way to connect to various models and run various agents. It provides a quick and easy way to setup and test other chromagent package

## Usage

### List available models

```shell
npx chromagent-cli model list
```

### Chat with a model

```shell
npx chromagent-cli model chat <model> [prompt]
```

This command allows you to chat with a specified model.

- `<model>`: The name of the model to chat with (e.g., `opus`).
- `[prompt]`: An optional initial prompt to send to the model.

If you provide an initial prompt, the model's response will be displayed, and the application will exit. If you don't provide an initial prompt, you will enter an interactive chat session.

The chat command also supports additional options:

- `-p, --prompt`: Exit immediately after first response without waiting for the next prompt.
- `-s, --system <prompt>`: System prompt to send to the model.

Example with system prompt:
```shell
npx chromagent-cli model chat opus -p "Hello" --system "You are a helpful assistant."
```

### Serve command

```shell
npx chromagent-cli serve -p <port>
```

This command starts an Express server that exposes an Anthropic-compatible API at `/api/anthropic/v1/messages`.

Options:
- `-p, --port <number>`: Port number for the server (default: 8080)

Example:
```shell
npx chromagent-cli serve -p 8080
```
