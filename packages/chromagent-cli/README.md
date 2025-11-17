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
