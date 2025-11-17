# LoadBalancedAnthropicModel

`LoadBalancedAnthropicModel` provides randomized load balancing for Anthropic models. It allows you to distribute requests among multiple models based on their weights and includes a cooldown mechanism to temporarily remove failing models from the selection pool.

## Constructor

```typescript
constructor(registry: AnthropicModelRegistry, models: ModelWithWeight[], errorTimeoutMs: number = 60000)
```

- `registry`: An instance of `AnthropicModelRegistry` that contains the registered Anthropic models.
- `models`: An array of `ModelWithWeight` objects, where each object specifies the `name` of the model and its `weight` for selection.
- `errorTimeoutMs`: The duration in milliseconds for which a failing model should be temporarily removed from the selection pool (cooldown period). The default is 60,000ms (1 minute).

## `message` Method

The `message` method performs the following steps:

1.  **Filters available models:** It filters the initial list of models to exclude any models that are currently in their cooldown period.
2.  **Selects a model:** It randomly selects a model from the available models based on their weights.
3.  **Calls the model's `message` method:** It calls the selected model's `message` method with the provided request.
4.  **Handles failures:** If the model invocation fails (throws an error or returns an invalid response), the model is placed in a cooldown period for the duration of `errorTimeoutMs`.
5.  **Retries with the next model:** If a model fails, the `message` method will automatically retry with the next available model until a successful response is received or all available models have failed.
6.  **Throws an error if all models fail:** If all available models fail to provide a valid response, an error is thrown.

## Example Usage

```typescript
import { AnthropicModelRegistry } from "./AnthropicModelRegistry";
import { LoadBalancedAnthropicModel } from "./LoadBalancedAnthropicModel";
import { AnthropicMessageRequest } from "./AnthropicModel";

// Create a model registry
const registry = new AnthropicModelRegistry();

// Register your Anthropic models
registry.register("model1", model1Instance);
registry.register("model2", model2Instance);

// Define the models and their weights
const models = [
    { name: "model1", weight: 80 },
    { name: "model2", weight: 20 },
];

// Create a load balancer with a 30-second cooldown
const loadBalancer = new LoadBalancedAnthropicModel(registry, models, 30000);

// Create a request
const request: AnthropicMessageRequest = {
    messages: [{ role: "user", content: "Hello, world!" }],
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
};

// Invoke the load balancer
const response = await loadBalancer.message(request);
```
