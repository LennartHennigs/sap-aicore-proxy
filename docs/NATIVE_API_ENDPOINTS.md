# Native API Endpoints

The SAP AI Core proxy now supports multiple API formats to provide better compatibility with different tools and SDKs.

## Available Endpoints

### 1. OpenAI-Compatible API (Original)
**Endpoint:** `POST /v1/chat/completions`

Standard OpenAI chat completions format - works with OpenAI SDKs and most AI tools.

**Example:**
```bash
curl -H "Authorization: Bearer any-key-works" -H "Content-Type: application/json" \
  -d '{"model": "anthropic--claude-4-sonnet", "max_tokens": 100, "messages": [{"role": "user", "content": "Hello!"}]}' \
  http://localhost:3001/v1/chat/completions
```

**Response Format:**
```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "anthropic--claude-4-sonnet",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  }
}
```

### 2. Claude Native API
**Endpoint:** `POST /v1/messages`

Native Anthropic Claude API format - works with Claude Desktop, Anthropic SDKs, and tools expecting Claude's format.

**Example:**
```bash
curl -H "Authorization: Bearer any-key-works" -H "Content-Type: application/json" \
  -d '{"model": "anthropic--claude-4-sonnet", "max_tokens": 100, "messages": [{"role": "user", "content": "Hello!"}]}' \
  http://localhost:3001/v1/messages
```

**Response Format:**
```json
{
  "id": "msg_1234567890",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you today?"
    }
  ],
  "model": "anthropic--claude-4-sonnet",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 10,
    "output_tokens": 25
  }
}
```

**Additional Features:**
- Supports `system` parameter for system messages
- Streaming support with Claude-style SSE events
- Vision support for compatible models

### 3. Gemini Native API
**Endpoint:** `POST /v1/models/{model}:generateContent`

Native Google Gemini API format - works with Google AI Studio, Gemini SDKs, and tools expecting Google's format.

**Example:**
```bash
curl -H "Authorization: Bearer any-key-works" -H "Content-Type: application/json" \
  -d '{"contents": [{"role": "user", "parts": [{"text": "Hello!"}]}], "generationConfig": {"maxOutputTokens": 100}}' \
  http://localhost:3001/v1/models/gemini-2.5-flash:generateContent
```

**Response Format:**
```json
{
  "candidates": [{
    "content": {
      "parts": [{"text": "Hello! How can I help you today?"}],
      "role": "model"
    },
    "finishReason": "STOP",
    "index": 0,
    "safetyRatings": []
  }],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 25,
    "totalTokenCount": 35
  }
}
```

**Additional Features:**
- Supports `systemInstruction` for system messages
- Streaming support with `?alt=sse` query parameter
- Vision support with `inlineData` and `fileData` formats

## Model Compatibility

All endpoints work with all configured models:
- `gpt-5-nano` (Provider API, supports streaming and vision)
- `anthropic--claude-4-sonnet` (Direct API, supports vision)
- `gemini-2.5-flash` (Direct API, vision disabled due to limitations)

## Benefits

1. **Tool Compatibility**: Use existing tools and SDKs without modification
2. **Flexibility**: Choose the API format that best fits your workflow
3. **Easy Migration**: Migrate existing integrations without changing code
4. **Native Features**: Access provider-specific features like system messages

## Configuration Tools

### Claude Desktop
Configure with Claude native endpoint:
```json
{
  "baseURL": "http://localhost:3001",
  "apiKey": "any-key-works"
}
```

### Google AI Studio
Configure with Gemini native endpoint:
```
Base URL: http://localhost:3001/v1/models/
API Key: any-key-works
```

### OpenAI-Compatible Tools
Configure with OpenAI endpoint:
```
Base URL: http://localhost:3001/v1
API Key: any-key-works
```

## Error Handling

Each endpoint returns errors in its native format:
- OpenAI: `{"error": {"message": "...", "type": "..."}}`
- Claude: `{"error": {"type": "...", "message": "..."}}`
- Gemini: `{"error": {"code": 400, "message": "...", "status": "..."}}`
