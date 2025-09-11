# SAP AI Core Proxy

## Project Overview

A high-performance, enterprise-grade proxy server that provides OpenAI-compatible API access to SAP AI Core's AI models (GPT-5 nano, Claude 4 Sonnet, Gemini 2.5 Flash).

## Architecture

```
AI Client → Proxy Server → [Model Pool] → SAP AI Core → AI Models
                        ↘ [Direct API] ↗
```

## Refactored Architecture

### Modular Design

```
src/
├── config/app-config.ts           # Centralized configuration management
├── auth/token-manager.ts           # Thread-safe OAuth token handling
├── models/model-router.ts          # Model configuration and routing logic
├── handlers/
│   ├── model-pool.ts              # Model instance pooling system
│   ├── direct-api-handler.ts      # Direct SAP AI Core API calls
│   └── openai-handler.ts          # Provider-based model handling
└── sap-aicore-proxy.ts    # Main server (170 lines, down from 400+)
```

## Key Components

### 1. Main Proxy Server (`src/sap-aicore-proxy.ts`)

- **Optimized Architecture**: Clean, modular design with 170 lines (vs 400+ original)
- **OpenAI-compatible API**: `/v1/chat/completions` and `/v1/models` endpoints
- **Enhanced Health Check**: `/health` with model pool statistics
- **Graceful Shutdown**: Proper resource cleanup on termination
- **Model Preloading**: Automatic preloading of provider models on startup
- **Commands**: `npm start`, `npm run dev` (with hot reload), `npm run start:legacy`

### 2. Model Pool System (`src/handlers/model-pool.ts`) - **NEW**

- **Instance Reuse**: One model instance per model type, reused across requests
- **Automatic Cleanup**: Idle models cleaned up after 30 minutes of inactivity
- **Usage Statistics**: Request count and idle time tracking per model
- **Preloading**: Provider models preloaded on server startup for faster first requests
- **Memory Management**: Fixed memory footprint regardless of request volume
- **Performance**: **Eliminates process spawning per request** - major optimization

### 3. Configuration Management (`src/config/app-config.ts`) - **NEW**

- **Centralized Config**: All settings in one place with environment validation
- **Configurable Values**: Port, host, CORS, token expiry buffer
- **Type Safety**: Full TypeScript interfaces for all configuration
- **Environment Validation**: Required variables validated on startup

### 4. Token Manager (`src/auth/token-manager.ts`) - **NEW**

- **Thread-safe**: Prevents race conditions with promise-based refresh
- **Smart Caching**: Configurable token expiry buffer
- **Error Handling**: Comprehensive authentication error management
- **Performance**: Reduces authentication overhead with proper caching

### 5. Model Router (`src/models/model-router.ts`) - **NEW**

- **Dynamic Routing**: Automatic routing between provider and direct API models
- **Model Validation**: Input validation and error handling
- **Configuration Loading**: Hot-reloadable model configuration
- **Model Discovery**: Easy model availability checking

### 6. Direct API Handler (`src/handlers/direct-api-handler.ts`) - **NEW**

- **Multi-format Support**: Anthropic bedrock, Google AI Studio, generic formats
- **Clean Architecture**: Separated from provider logic
- **Error Handling**: Comprehensive API error management
- **Type Safety**: Full TypeScript interfaces

### 7. OpenAI Handler (`src/handlers/openai-handler.ts`) - **OPTIMIZED + STREAMING**

- **Model Pooling**: Uses pooled model instances instead of creating new ones
- **No Process Spawning**: Direct module integration eliminates subprocess overhead
- **Performance**: Instant model access after first use
- **True Streaming Support**: Real-time token-by-token streaming for GPT-5 nano
- **Streaming Integration**: New `streamProviderAPI()` method with AI SDK streaming capabilities
- **Type Safety**: `StreamChunk` interface for streaming responses
- **Parameter Compatibility**: Fixed maxCompletionTokens vs maxTokens issues

### 8. AI SDK Wrapper (`src/lib/ai-sdk.ts`)

- Compatibility layer between SAP AI Core provider and OpenAI Agents SDK
- Required for proper integration with SAP AI Core

### 9. Model Deployment Script (`scripts/deploy-model.sh`)

- Checks deployment status of models in SAP AI Core
- Handles OAuth token management
- Returns deployment URLs for configuration
- Generates models.json configuration file from deployed models
- Usage: `./scripts/deploy-model.sh <model-name> [--make-config] [--help]`
- Options:
  - `--make-config`: Generate `config/models.json` from deployed models with generic placeholders
  - `--help`: Show usage information
- Note: Script no longer creates configurations automatically - configurations must exist first

## Configuration

### Environment Variables (.env)

```env
# SAP AI Core Configuration (Required)
AICORE_AUTH_URL=https://ux-q4sw2ugf.authentication.eu12.hana.ondemand.com
AICORE_CLIENT_ID="sb-1d2ac401-c045-41f8-b53b-faf98b30c3ae!b1251356|xsuaa_std!b318061"
AICORE_CLIENT_SECRET='e9eca38b-1396-4d78-bf1a-3358c5121391$w8ynu-QF0sfHfp73OZU-kp7-BAgl0DPx1796wzWS-GI='
AICORE_BASE_URL=https://api.ai.intprod-eu12.eu-central-1.aws.ml.hana.ondemand.com

# Server Configuration (Optional - defaults provided)
PORT=3001                    # Server port
HOST=localhost              # Server host
TOKEN_EXPIRY_BUFFER=60      # Token refresh buffer in seconds
CORS_ORIGIN=*              # CORS origin policy

# Langfuse (Optional)
LANGFUSE_SECRET_KEY="sk-lf-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
LANGFUSE_PUBLIC_KEY="pk-lf-yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
LANGFUSE_ENDPOINT=http://localhost:3000
```

**Important Notes:**

- Client ID and secret must be quoted due to special characters (`!`, `|`, `$`)
- Use single quotes for client secret to prevent shell variable expansion
- All server configuration is now optional with sensible defaults
- Environment validation ensures required variables are present on startup

### Client Configuration

```
API Host: http://localhost:3001
API Path: /v1
API Key: any-string-works
Model: gpt-5-nano | anthropic--claude-4-sonnet | gemini-2.5-flash
```

**Model Selection**: The proxy supports dynamic model selection. Configure the model name in your AI client and the proxy will automatically use that specific SAP AI Core deployment.

**Model Status** (Final - All Models Working with Streaming! 🎉🌊):

- ✅ `gpt-5-nano` - OpenAI GPT-5 nano model (working via SAP AI Core provider) **🌊 True Streaming**
  - Real-time token-by-token streaming as the model generates responses
  - Immediate response start for better user experience
  - OpenAI-compatible Server-Sent Events (SSE) format
- ✅ `anthropic--claude-4-sonnet` - Anthropic Claude 4 Sonnet model (working via direct API) **📦 Mock Streaming**
  - Endpoint: `{DEPLOYMENT_URL}/invoke`
  - Format: Anthropic bedrock format with `anthropic_version: "bedrock-2023-05-31"`
  - Complete response sent as streaming chunks for compatibility
- ✅ `gemini-2.5-flash` - Google Gemini 2.5 Flash model (working via direct API) **📦 Mock Streaming**
  - Endpoint: `{DEPLOYMENT_URL}/models/gemini-2.5-flash:generateContent`
  - Format: Google AI Studio format with `contents` and `parts`
  - Complete response sent as streaming chunks for compatibility

### Streaming Support Details

- **True Streaming** (🌊): Real-time token-by-token streaming as the model generates responses
- **Mock Streaming** (📦): Complete response sent as streaming chunks for ChatboxAI compatibility
- **Intelligent Detection**: System automatically detects streaming capability and routes accordingly
- **Consistent API**: All models provide streaming-like responses regardless of underlying capability

**Final Architecture**: 
- **GPT models**: Route via SAP AI Core provider (OpenAI Agents SDK wrapper)
- **Claude models**: Route via direct API to `/invoke` endpoint with Anthropic format
- **Gemini models**: Route via direct API to `/models/{model}:generateContent` with Google format

**Implementation Success**: 
- ✅ Multi-model mapping system implemented
- ✅ Dual routing logic (provider vs direct API) implemented and working
- ✅ Direct API handlers using correct SAP AI Core formats implemented  
- ✅ All three models confirmed working through proxy
- ✅ OpenAI-compatible response formatting for all models
- ✅ OpenAI-compatible API integration ready for all models

## Technical Challenges & Solutions

### 1. ✅ SOLVED: Process Spawning Per Request (Major Performance Issue)

**Problem**: Original implementation spawned a new Node.js process for every request
**Impact**: Massive performance overhead, security risks, resource leaks
**Solution**: Implemented model pooling system with instance reuse per model type
```typescript
// OLD: Process spawning per request
const script = `import { sapAiCore }...`;
fs.writeFileSync(tempScript, script);
const child = spawn('node', ['--env-file=.env', tempScript]);

// NEW: Model pooling with reuse
const agent = await modelPool.getModel(modelName); // Reuses existing instance
```

### 2. ✅ SOLVED: Code Complexity and Maintainability

**Problem**: Monolithic 400+ line file with complex branching logic
**Impact**: Difficult to maintain, test, and extend
**Solution**: Modular architecture with clean separation of concerns
- 6 focused modules vs 1 monolithic file
- Main server reduced from 400+ to 170 lines
- Each module has single responsibility

### 3. ✅ SOLVED: Race Conditions in Token Management

**Problem**: Multiple concurrent requests could cause token refresh race conditions
**Impact**: Authentication failures and request errors
**Solution**: Thread-safe token manager with promise-based refresh
```typescript
// Prevents race conditions by reusing existing refresh promise
if (this.refreshPromise) {
  return this.refreshPromise;
}
```

### 4. ✅ SOLVED: Hard-coded Values and Configuration

**Problem**: Port, timeouts, and other values hard-coded throughout codebase
**Impact**: Inflexible deployment and configuration management
**Solution**: Centralized configuration with environment validation
- All values configurable via environment variables
- Type-safe configuration with validation
- Sensible defaults for optional settings

### 5. ✅ SOLVED: AI SDK Version Compatibility

**Problem**: AI SDK 5 only supports v2 specification, but SAP AI Core provider uses v1
**Solution**: Use OpenAI Agents SDK with `aisdk()` wrapper instead of direct AI SDK

### 6. ✅ SOLVED: Environment Variable Parsing

**Problem**: Special characters in credentials caused shell parsing errors
**Solution**: Proper quoting - double quotes for client ID, single quotes for client secret

### 7. ✅ SOLVED: ES Module Compatibility

**Problem**: `require()` not available in ES modules
**Solution**: Use dynamic `await import()` for Node.js built-ins

### 8. ✅ SOLVED: Tracing Context Issues

**Problem**: "No existing trace found" errors in OpenAI Agents SDK
**Solution**: Call `setTracingDisabled(true)` globally in model pool

### 9. ✅ SOLVED: Model Configuration Management

**Problem**: Hard-coded model patterns made the system inflexible for new models

**Solution**:

- Dynamic model router with configuration-driven routing
- Generate generic `config/models.json` with placeholders for manual configuration
- Added `--make-config` flag to deployment script for generating base configuration
- Hot-reloadable model configuration

## Optimized Proxy Implementation Strategy

The refactored proxy approach eliminates all performance anti-patterns:

### 1. **Model Pooling**: Reuse model instances per model type

```typescript
// Model instances are created once and reused
class ModelPool {
  private pool: Map<string, PooledModel> = new Map();
  
  async getModel(modelName: string): Promise<Agent> {
    const existing = this.pool.get(modelName);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.agent; // Reuse existing instance
    }
    // Create new instance only if not exists
    return this.createNewInstance(modelName);
  }
}
```

### 2. **Direct Module Integration**: No temporary files or process spawning

```typescript
// Clean, direct integration without subprocess overhead
export class OpenAIHandler {
  async callProviderAPI(modelName: string, messages: any[]): Promise<OpenAIResponse> {
    const agent = await modelPool.getModel(modelName); // Get pooled instance
    const result = await run(agent, prompt);
    return { success: true, text: result.finalOutput || 'No response' };
  }
}
```

### 3. **Intelligent Routing**: Automatic model type detection and routing

```typescript
// Route to appropriate handler based on model configuration
if (modelRouter.useDirectAPI(model)) {
  result = await directApiHandler.callDirectAPI(model, messages, stream);
} else {
  result = await openaiHandler.callProviderAPI(model, messages);
}
```

### 4. **Performance Optimizations**

- **Preloading**: Provider models preloaded on startup
- **Cleanup**: Automatic cleanup of idle model instances after 30 minutes
- **Statistics**: Real-time usage tracking and performance monitoring
- **Memory Management**: Fixed memory footprint regardless of request volume

## Commands

### Server Management

- `npm start` - Start optimized proxy server with model pooling
- `npm run dev` - Start proxy in development mode with hot reload
- `npm run start:legacy` - Start original proxy implementation (fallback)
- `npm run proxy` - Alias for `npm start`
- `npm stop` - Stop the proxy server

### Model Management

- `npm run deploy-model <model-name>` - Check model deployment status in SAP AI Core
- `./scripts/deploy-model.sh <model-name> [--make-config]` - Check deployment status and optionally generate models.json
- `./scripts/list-deployed-models.sh [--help]` - List deployed models with support status

### Monitoring

- `curl http://localhost:3001/health` - Check server health and model pool statistics
- `curl http://localhost:3001/v1/models` - List available models (OpenAI-compatible)

## Dependencies

### Core Dependencies

- `@ai-foundry/sap-aicore-provider`: SAP AI Core provider
- `@openai/agents`: OpenAI Agents SDK for compatibility wrapper
- `@ai-sdk/provider`: Base AI SDK types
- `express`: HTTP server framework
- `cors`: CORS support for web clients

## Lessons Learned

### Performance & Architecture

1. **Process Spawning is Expensive**: Creating subprocesses per request creates massive overhead - model pooling is essential for production
2. **Modular Design Matters**: Breaking monolithic code into focused modules dramatically improves maintainability
3. **Configuration Management**: Centralized, validated configuration prevents deployment issues and improves flexibility
4. **Resource Management**: Proper cleanup and monitoring are essential for long-running services

### Enterprise Integration

5. **Provider Compatibility**: Different AI SDKs have specification version requirements that may not align with enterprise providers
6. **Authentication Complexity**: Enterprise OAuth flows require careful credential handling and environment setup
7. **Shell Escaping**: Special characters in environment variables need proper quoting strategies
8. **Error Debugging**: Detailed logging at each integration point is essential for troubleshooting complex authentication and API flows

### Production Readiness

9. **Thread Safety**: Race conditions in token management can cause authentication failures under load
10. **Memory Management**: Without proper cleanup, long-running services can experience memory leaks
11. **Monitoring**: Built-in health checks and statistics are essential for production operations
12. **Graceful Shutdown**: Proper resource cleanup on termination prevents resource leaks

## Success Metrics

### Performance Achievements

- ✅ **Zero Process Spawning**: Eliminated subprocess overhead per request through model pooling
- ✅ **Memory Efficiency**: Fixed memory footprint regardless of request volume
- ✅ **CPU Efficiency**: No process creation overhead after initial model loading
- ✅ **Network Efficiency**: Connection reuse and proper token caching with race condition prevention

### Architecture Improvements

- ✅ **Modular Design**: Clean separation of concerns across 6 focused modules
- ✅ **Code Reduction**: Main server reduced from 400+ to 170 lines
- ✅ **Type Safety**: Full TypeScript coverage with proper interfaces
- ✅ **Configuration Management**: Centralized, validated configuration system

### Enterprise Features

- ✅ **Thread-safe Operations**: Race condition prevention in token management
- ✅ **Graceful Shutdown**: Proper resource cleanup on termination
- ✅ **Health Monitoring**: Real-time statistics and system health checks
- ✅ **Model Pool Management**: Automatic cleanup and usage tracking

### API Compatibility

- ✅ **OpenAI Compatibility**: Full OpenAI API specification compliance
- ✅ **Multi-model Support**: GPT-5 nano, Claude 4 Sonnet, Gemini 2.5 Flash
- ✅ **Dynamic Model Selection**: Request-based model routing
- ✅ **Streaming Support**: Both streaming and non-streaming response modes

### Developer Experience

- ✅ **Hot Reload**: Development mode with automatic restart
- ✅ **Legacy Support**: Fallback to original implementation if needed
- ✅ **Enhanced Logging**: Structured console output with performance indicators
- ✅ **Model Discovery**: Easy model availability checking via API endpoints

## Final Implementation Notes

The refactored implementation represents a complete architectural overhaul:

### Key Architectural Decisions

1. **Model Pooling Over Process Spawning**: Eliminated the major performance bottleneck by reusing model instances
2. **Modular Design**: Clean separation of concerns for maintainability and testability
3. **Configuration-Driven**: All behavior controlled through validated configuration
4. **Resource Management**: Proper lifecycle management with cleanup and monitoring

### Performance Optimizations

1. **Instance Reuse**: Model instances created once and reused across requests
2. **Preloading**: Critical models loaded on startup for faster first requests
3. **Intelligent Cleanup**: Automatic removal of idle instances to prevent memory leaks
4. **Thread Safety**: Race condition prevention in all shared resources

### Production Readiness

1. **Monitoring**: Built-in health checks and performance statistics
2. **Graceful Shutdown**: Proper cleanup of all resources on termination
3. **Error Handling**: Comprehensive error management with proper HTTP status codes
4. **Logging**: Structured logging with performance indicators

The proxy now provides **enterprise-grade performance** and **reliability** while maintaining full backward compatibility with the original API. This demonstrates how to properly architect high-performance proxy services for enterprise AI integration.

### Performance Impact

- **Before**: New process spawned per request (massive overhead)
- **After**: Model instance reuse with zero process spawning (optimal performance)
- **Result**: Production-ready performance suitable for high-volume enterprise usage
