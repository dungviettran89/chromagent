import { VertexGeminiAnthropicModel } from './VertexGeminiAnthropicModel';
import { AnthropicMessageRequest } from './AnthropicModel';
import * as assert from 'assert';

const model = new VertexGeminiAnthropicModel({ apiKey: 'test', model: 'gemini-2.0-flash' });
const transform = (model as any).transformToVertexFormat.bind(model);

console.log('Running verification for VertexGeminiAnthropicModel tool mapping...');

// Test 1: Tools Mapping
console.log('Test 1: Tools Mapping');
const requestWithTools: AnthropicMessageRequest = {
    model: 'claude-3-sonnet',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 100,
    tools: [{
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location']
        }
    }]
};

const vertexRequest1 = transform(requestWithTools);
assert.strictEqual(vertexRequest1.tools.length, 1);
assert.strictEqual(vertexRequest1.tools[0].functionDeclarations.length, 1);
assert.strictEqual(vertexRequest1.tools[0].functionDeclarations[0].name, 'get_weather');
assert.deepStrictEqual(vertexRequest1.tools[0].functionDeclarations[0].parameters, requestWithTools.tools![0].input_schema);
console.log('PASS');

// Test 2: Tool Choice Auto
console.log('Test 2: Tool Choice Auto');
const requestAuto: AnthropicMessageRequest = {
    ...requestWithTools,
    tool_choice: { type: 'auto' }
};
const vertexRequest2 = transform(requestAuto);
assert.deepStrictEqual(vertexRequest2.toolConfig, { functionCallingConfig: { mode: 'AUTO' } });
console.log('PASS');

// Test 3: Tool Choice Any
console.log('Test 3: Tool Choice Any');
const requestAny: AnthropicMessageRequest = {
    ...requestWithTools,
    tool_choice: { type: 'any' }
};
const vertexRequest3 = transform(requestAny);
assert.deepStrictEqual(vertexRequest3.toolConfig, { functionCallingConfig: { mode: 'ANY' } });
console.log('PASS');

// Test 4: Tool Choice Specific
console.log('Test 4: Tool Choice Specific');
const requestTool: AnthropicMessageRequest = {
    ...requestWithTools,
    tool_choice: { type: 'tool', name: 'get_weather' }
};
const vertexRequest4 = transform(requestTool);
assert.deepStrictEqual(vertexRequest4.toolConfig, { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['get_weather'] } });
console.log('PASS');

// Test 5: Tool Result Mapping
console.log('Test 5: Tool Result Mapping');
const requestResult: AnthropicMessageRequest = {
    model: 'claude-3-sonnet',
    messages: [
        { role: 'user', content: 'Check weather' },
        {
            role: 'assistant',
            content: [
                { type: 'tool_use', id: 'call_123', name: 'get_weather', input: { location: 'Paris' } }
            ]
        },
        {
            role: 'user',
            content: [
                { type: 'tool_result', tool_use_id: 'call_123', content: '{"temp": 20}' }
            ]
        }
    ],
    max_tokens: 100
};

const vertexRequest5 = transform(requestResult);
const lastMessage = vertexRequest5.contents[vertexRequest5.contents.length - 1];
assert.strictEqual(lastMessage.role, 'user');
assert.strictEqual(lastMessage.parts.length, 1);
assert.ok(lastMessage.parts[0].functionResponse);
assert.strictEqual(lastMessage.parts[0].functionResponse.name, 'get_weather');
assert.deepStrictEqual(lastMessage.parts[0].functionResponse.response, { temp: 20 });
console.log('PASS');

console.log('All tests passed!');
