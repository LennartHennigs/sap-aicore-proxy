# SAP AI Core Proxy - LLM Integration Guide

## Overview for AI Assistants

This is a production-ready proxy server that provides OpenAI-compatible API access to SAP AI Core's deployed AI models. The proxy handles authentication, request routing, model pooling, and format conversion between different AI providers.

## Architecture for LLMs

### Core Components

1. **Main Server**: [src/sap-aicore-proxy.ts](./src/sap-aicore-proxy.ts)
   - Express.js server with OpenAI-compatible endpoints
   - Handles `/v1/chat/completions` and `/v1/models` endpoints
   - Supports both streaming and non-streaming responses
   - File upload processing with vision support

2. **Model Router**: [src/models/model-router.ts](./src/models/model-router.ts)
   - Central model configuration and validation
   - Routes between Provider API and Direct API calls
   - Vision capability detection per model

3. **Handler Architecture**:
   - **Provider API Handler**: [src/handlers/openai-handler.ts](./src/handlers/openai-handler.ts) - Uses SAP AI Core provider SDK
   - **Direct API Handler**: [src/handlers/direct-api-handler.ts](./src/handlers/direct-api-handler.ts) - Direct REST calls to SAP AI Core
   - **Model Pool**: [src/handlers/model-pool.ts](./src/handlers/model-pool.ts) - Instance pooling for performance

## Configuration System

### Model Configuration Schema
The [config/models.json](./config/models.json) file defines supported models:

```typescript
interface ModelConfig 
  provider: string;              // e.g., "anthropic", "sap-aicore", "google"
  supportsStreaming: boolean;    // True streaming capability
  supportsVision?: boolean;      // Image processing support
  apiType: 'provider' | 'direct'; // Routing strategy
  endpoint?: string;             // Direct API endpoint path
  requestFormat?: string;        // Format conversion type
  anthropic_version?: string;    // Anthropic-specific version
  max_tokens?: number;          // Default token limit
}
```

### Environment Variables
See [.env.example](./.env.example) for configuration options:

- **SAP AI Core Auth**: `AICORE_AUTH_URL`, `AICORE_CLIENT_ID`, `AICORE_CLIENT_SECRET`, `AICORE_BASE_URL`
- **Server Config**: `PORT`, `HOST`, `CORS_ORIGIN`
- **Model Defaults**: `DEFAULT_MODEL`, `DEFAULT_MAX_TOKENS`
- **Performance**: `MODEL_POOL_MAX_IDLE_TIME`, `MODEL_POOL_CLEANUP_INTERVAL`
- **Deployment ID Overrides**: `GPT_5_NANO_DEPLOYMENT_ID`, `ANTHROPIC_CLAUDE_4_SONNET_DEPLOYMENT_ID`, `GEMINI_2_5_FLASH_DEPLOYMENT_ID`

#### Streaming Performance Configuration (v1.2.4)
```bash
# Detection Service Optimizations
STREAMING_DETECTION_TIMEOUT=3000         # Reduced from 10s (70% faster)
STREAMING_CACHE_TIME=604800000            # Extended to 7 days
STREAMING_CONCURRENT_TESTS=3              # Parallel detection
STREAMING_SKIP_CONFIGURED=true            # Skip tests for configured models

# Mock Streaming Improvements  
MOCK_STREAMING_BASE_CHUNK_SIZE=12         # Increased from 8
MOCK_STREAMING_CHUNK_VARIATION=8          # Dynamic sizing range
MOCK_STREAMING_BASE_DELAY=8               # Reduced from 30ms (60% faster)
MOCK_STREAMING_DELAY_VARIATION=7          # Natural timing variation
MOCK_STREAMING_WORD_BOUNDARY=true         # Smart boundary detection

# Performance Monitoring
STREAMING_PERFORMANCE_MONITORING=true     # Enable performance tracking
STREAMING_BENCHMARK_ON_STARTUP=false      # Startup benchmarking
```

## Automatic Deployment ID Discovery

### Discovery Service Architecture

The [src/services/deployment-discovery.ts](./src/services/deployment-discovery.ts) provides automatic deployment ID resolution:

```typescript
interface DeploymentDiscoveryService {
  // Core discovery functionality
  discoverDeployments(): Promise<DiscoveryResult>;
  getDeploymentId(modelName: string): Promise<string | null>;
  
  // Validation and caching
  validateAllModels(modelNames: string[]): Promise<ValidationResult>;
  clearCache(): void;
}
```

### Discovery Process Flow

1. **Startup Discovery**:
   - Queries SAP AI Core `/v2/lm/deployments?scenarioId=foundation-models`
   - Maps deployed model names to configured model names
   - Caches results for 5-minute intervals

2. **Environment Variable Priority**:

   ```bash
   # Check environment override first
   GPT_5_NANO_DEPLOYMENT_ID=custom-id
   
   # Fallback to auto-discovered ID
   # Finally fallback to config deploymentId (if present)
   ```

3. **Intelligent Mapping**:

   ```typescript
   // Maps SAP AI Core model names to proxy model names
   const modelNameMapping = {
     "gpt-5-nano": "gpt-5-nano",
     "claude-4-sonnet": "anthropic--claude-4-sonnet", 
     "gemini-2.5-flash": "gemini-2.5-flash"
   };
   ```

### Error Handling Strategy

- **API Failures**: Graceful degradation with clear error messages
- **Missing Deployments**: Specific guidance on environment variable overrides
- **Authentication Issues**: Token refresh and retry logic
- **Cache Expiry**: Automatic refresh with fallback to cached values

### Environment Variable Generation

The system automatically generates environment variable names from model names:

```typescript
// "gpt-5-nano" → "GPT_5_NANO_DEPLOYMENT_ID"
// "anthropic--claude-4-sonnet" → "ANTHROPIC_CLAUDE_4_SONNET_DEPLOYMENT_ID"
function getEnvVarName(modelName: string): string {
  return modelName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') + '_DEPLOYMENT_ID';
}
```

## Request Processing Flow

### 1. Request Reception
- OpenAI-compatible format received at `/v1/chat/completions`
- Content processing for files, images, and text arrays
- Model validation and capability checking

### 2. Content Processing
The proxy handles multiple content formats:
- **Text**: Standard string messages
- **Files**: Extracted text content with base64 decoding
- **Images**: Vision model routing with format conversion
- **Mixed Content**: Array format with text + image combinations

### 3. Model Routing Decision
```typescript
// Provider API (streaming support, model pooling)
if (modelRouter.isProviderSupported(model)) {
  return openaiHandler.callProviderAPI(model, messages);
}

// Direct API (vision models, format conversion)
if (modelRouter.useDirectAPI(model)) {
  return directApiHandler.callDirectAPI(model, messages);
}
```

### 4. Response Handling
- **True Streaming**: Real-time token generation (GPT models)
- **Mock Streaming**: Complete response as streamed chunks (Claude, Gemini)
- **Vision Processing**: Image analysis with fallback handling

## Model-Specific Implementation Details

### Claude 4 Sonnet (`anthropic--claude-4-sonnet`)
- **API Type**: Direct API to SAP AI Core
- **Vision Support**: Full image analysis capabilities
- **Request Format**: Anthropic Bedrock format conversion
- **Streaming**: Mock streaming (complete response chunked)
- **Special Features**: Handles Anthropic-specific message format

### GPT-5 Nano (`gpt-5-nano`)
- **API Type**: Provider API through SAP AI Core SDK
- **Vision Support**: Available but limited
- **Streaming**: True real-time streaming
- **Model Pooling**: Instances cached and reused
- **Performance**: Optimized for high throughput

### Gemini 2.5 Flash (`gemini-2.5-flash`)
- **API Type**: Direct API calls
- **Vision Support**: Disabled due to limitations
- **Request Format**: Google AI Studio format
- **Special Handling**: Text length limits with image processing

## Code Patterns for LLMs

### Adding New Models

1. **Update Configuration** (deployment ID is now optional):

```json
// config/models.json
{
  "new-model": {
    "provider": "provider-name",
    "supportsStreaming": false,
    "supportsVision": true,
    "apiType": "direct",
    "endpoint": "/your-endpoint",
    "description": "Model description"
    // deploymentId will be auto-discovered
  }
}
```

2. **Add to Model Arrays**:
```json
{
  "providerSupportedModels": ["gpt-5-nano"],
  "directApiModels": ["anthropic--claude-4-sonnet", "new-model"]
}
```

3. **Optional Environment Override**:

```bash
# .env file (optional for specific deployments)
NEW_MODEL_DEPLOYMENT_ID=your-specific-deployment-id
```

The system will automatically discover the deployment ID from SAP AI Core based on the model name.

### Request Format Conversions

The proxy automatically converts between formats:

**OpenAI → Anthropic**:
```typescript
// From: {"role": "user", "content": "text"}
// To: {"role": "user", "content": [{"type": "text", "text": "text"}]}
```

**OpenAI → Google**:
```typescript
// From: {"role": "user", "content": "text"}
// To: {"role": "user", "parts": [{"text": "text"}]}
```

### Vision Processing

Vision requests are automatically routed to capable models:
```typescript
// Detects image content and suggests vision models
if (hasImages && !modelRouter.supportsVision(model)) {
  const visionModels = modelRouter.getAllModels()
    .filter(m => modelRouter.supportsVision(m));
  // Suggests: ["anthropic--claude-4-sonnet", "gpt-5-nano"]
}
```

## Error Handling Patterns

### Common Error Types
- **Invalid Model**: Model not found in configuration
- **Vision Mismatch**: Images sent to non-vision models
- **API Failures**: SAP AI Core connectivity issues
- **Format Errors**: Request/response conversion failures
- **Authentication**: Token refresh and credential issues

### Fallback Strategies
```typescript
// Vision processing fallback
if (providerVisionFails) {
  try {
    result = await directApiHandler.callDirectAPI(model, messages, false);
  } catch (fallbackError) {
    // Both failed, return error
  }
}
```

## Performance Optimization

### Streaming Performance Enhancements (v1.2.4)

#### Enhanced Streaming Architecture
- **Optimized Detection Service**: Reduced timeout from 10s to 3s (70% faster)
- **Extended Cache Duration**: 7 days vs 1 day for better cache hit rates
- **Concurrent Detection**: Parallel capability detection for multiple models
- **Smart Caching**: Skip live testing for configured models

#### Improved Mock Streaming
- **Dynamic Chunk Sizing**: 12±8 characters vs fixed 8 characters
- **Reduced Delays**: 8-15ms vs 30ms per chunk (60% faster)
- **Word Boundary Awareness**: Natural streaming flow with intelligent boundaries
- **Adaptive Algorithms**: Natural timing variations for better user experience

#### Performance Monitoring System
- **Streaming Performance Monitor**: Real-time performance tracking and benchmarking
- **Detailed Metrics**: Response times, chunk rates, and optimization effectiveness
- **Benchmarking Tools**: Comprehensive performance validation and testing

### Model Pooling
- Instances cached per model type
- Automatic cleanup after idle time
- Thread-safe operations with token management
- Preloading for frequently used models

### Streaming Strategies
- **True Streaming**: Server-Sent Events for real-time responses
- **Mock Streaming**: Compatibility layer for non-streaming models with performance optimizations
- **Chunked Processing**: Large responses broken into manageable pieces with dynamic sizing

## Testing and Validation

### Test Files
- [tests/unit/](./tests/unit/) - Unit tests for individual components
- [tests/integration/](./tests/integration/) - End-to-end API testing
- [tests/performance/](./tests/performance/) - Load and performance testing
- [src/test-direct-api.ts](./src/test-direct-api.ts) - Direct API validation

### Validation System
The proxy validates all configurations on startup:
```bash
✅ All model configurations validated successfully
📡 Configure your AI client with:
   • API Host: http://localhost:3001
   • Available Models: gpt-5-nano, anthropic--claude-4-sonnet, gemini-2.5-flash
```

## Deployment Scripts

### Model Management
- [scripts/deploy-model.sh](./scripts/deploy-model.sh) - Deploy models to SAP AI Core
- [scripts/list-deployed-models.sh](./scripts/list-deployed-models.sh) - List deployed models with status

### Usage Examples
```bash
# Check model deployment
./scripts/deploy-model.sh gpt-5-nano

# Generate config from deployed models
./scripts/deploy-model.sh gpt-5-nano --make-config

# List all models with capabilities
./scripts/list-deployed-models.sh
```

## Troubleshooting for LLMs

### Common Issues

1. **Model Not Found**: Check [config/models.json](./config/models.json) for model definition
2. **Deployment ID Missing**: 
   - Check if model is deployed in SAP AI Core using `./scripts/list-deployed-models.sh`
   - Set environment override: `MODEL_NAME_DEPLOYMENT_ID=your-deployment-id`
   - Verify model name mapping in discovery service
3. **Vision Errors**: Verify model supports vision in configuration
4. **Streaming Issues**: Check model's `supportsStreaming` setting  
5. **Authentication**: Verify `.env` credentials and token refresh
6. **Discovery Failures**: Check SAP AI Core API connectivity and permissions
7. **Format Errors**: Check request format matches expected provider format


### Debug Endpoints
- `GET /health` - Server status and model pool statistics
- `GET /v1/models` - Available models with metadata
- Console logs provide detailed request/response information

### Configuration Validation
```bash
npm start  # Validates all models on startup
# Look for validation errors in console output
```

## Security Best Practices

- Never commit `.env` file (already in `.gitignore`)
- Use placeholder values in documentation
- Credentials are validated and cached securely
- Request size limits prevent abuse
- CORS configuration controls access

This proxy serves as a bridge between OpenAI-compatible clients and SAP AI Core's enterprise AI models, providing a production-ready solution with comprehensive error handling, performance optimization, and multi-model support.
