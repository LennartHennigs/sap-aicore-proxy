# SAP AI Core Proxy 🚀

A high-performance, enterprise-grade proxy server that provides OpenAI-compatible API access to SAP AI Core's AI models (GPT-5 nano, Claude 4 Sonnet, Gemini 2.5 Flash).

---

## ⚡ Quick Start

```bash
# 1. Clone and enter
git clone https://github.com/your-repo/sap-aicore-proxy.git
cd sap-aicore-proxy

# 2. Install dependencies
npm ci

# 3. Configure environment
cp .env.example .env   # copy from example and edit with your SAP AI Core credentials

# 4. Start proxy server
npm start

# 5. Stop proxy server (when needed)
npm stop
```

The proxy will be available at `http://localhost:3001`

---

## 🔑 Environment Configuration

Create a `.env` file from the provided `.env.example` template with your SAP AI Core credentials:

```env
# SAP AI Core Configuration (Required)
AICORE_AUTH_URL=https://your-auth-url.hana.ondemand.com
AICORE_CLIENT_ID="your-client-id"
AICORE_CLIENT_SECRET='your-client-secret'
AICORE_BASE_URL=https://api.ai.your-region.aws.ml.hana.ondemand.com

# Server Configuration (Optional - defaults provided)
PORT=3001                    # Server port
HOST=localhost              # Server host
TOKEN_EXPIRY_BUFFER=60      # Token refresh buffer in seconds
CORS_ORIGIN=*              # CORS origin policy

# Model Configuration (Optional)
DEFAULT_MODEL=gpt-5-nano
DEFAULT_MAX_TOKENS=1000
DEFAULT_TOKEN_EXPIRY=3600

# Model Pool Configuration (Optional)
MODEL_POOL_MAX_IDLE_TIME=1800000
MODEL_POOL_CLEANUP_INTERVAL=300000

# Provider Configuration (Optional)
SAP_AICORE_PROVIDER_PREFIX=sap-aicore

# API Endpoint Defaults (Optional)
ANTHROPIC_DEFAULT_VERSION=bedrock-2023-05-31
ANTHROPIC_DEFAULT_ENDPOINT=/invoke
GEMINI_DEFAULT_ENDPOINT=/models/gemini-2.5-flash:generateContent
GENERIC_DEFAULT_ENDPOINT=

# Body Size Limits (Optional)
BODY_LIMIT_JSON=50mb
BODY_LIMIT_URLENCODED=50mb
BODY_LIMIT_RAW=50mb
```

**Important**:

- Client ID should be in double quotes
- Client secret should be in single quotes to handle special characters
- All server configuration is optional with sensible defaults
- **Configuration Validation**: The server validates all configurations on startup and reports any issues

---

## 📱 Client Configuration

Configure your OpenAI-compatible AI client with these settings:

- **API Host**: `http://localhost:3001`
- **API Path**: `/v1`
- **API Key**: `any-string-works`
- **Model**: `gpt-5-nano` or `anthropic--claude-4-sonnet` or `gemini-2.5-flash`

---

## 🛠️ Commands

### Server Management

- `npm start` - Start optimized proxy server with model pooling
- `npm run dev` - Start proxy in development mode with hot reload
- `npm run start:legacy` - Start original proxy implementation (fallback)
- `npm run proxy` - Alias for `npm start`
- `npm stop` - Stop the proxy server

### Model Management

- `./scripts/deploy-model.sh <model-name> [--make-config] [--help]` - Check model deployment status
- `./scripts/list-deployed-models.sh [MODEL_NAME|/all] [--help]` - List deployed models

### Monitoring

- `curl http://localhost:3001/health` - Check server health and model pool statistics
- `curl http://localhost:3001/v1/models` - List available models (OpenAI-compatible)

---

## 🎯 Supported Models

- ✅ `gpt-5-nano` - OpenAI GPT-5 nano (working via SAP AI Core provider) **🌊 True Streaming** ⚪ Text-only
- ✅ `anthropic--claude-4-sonnet` - Anthropic Claude 4 Sonnet (working via direct API) **📦 Mock Streaming** **👁️ Vision**
- ✅ `gemini-2.5-flash` - Google Gemini 2.5 Flash (working via direct API) **📦 Mock Streaming** **👁️ Vision**

### Advanced Features

- **True Streaming** (🌊): Real-time token-by-token streaming as the model generates responses
- **Mock Streaming** (📦): Complete response sent as streaming chunks for compatibility
- **Vision Support** (👁️): Claude 4 Sonnet and Gemini 2.5 Flash support image analysis and understanding
- **Configuration Validation** (🔍): Comprehensive startup validation ensures all models are properly configured

---

## 👁️ Vision Support

**Claude 4 Sonnet** and **Gemini 2.5 Flash** support image analysis and understanding. Simply upload images in your AI client and select one of these models to analyze them:

- **Supported formats**: PNG, JPG, JPEG, WebP, GIF
- **Upload methods**: Direct image upload or base64 data URLs
- **Multi-image**: Support for multiple images in a single conversation
- **Format conversion**: Automatic conversion between OpenAI, Anthropic, and Google image formats

### Vision Usage Examples

```
"What do you see in this image?"
"Describe the colors and composition"
"What text is visible in this screenshot?"
"Compare these two images"
```

---

## 🔍 Model Management

### Check Model Deployment Status

```bash
./scripts/deploy-model.sh gpt-5-nano
```

This will check if the model is deployed in SAP AI Core and show deployment details.

### Generate Configuration File

```bash
./scripts/deploy-model.sh gpt-5-nano --make-config
```

This will generate `config/models.json` from all deployed models with generic placeholders that need manual configuration.

### List Deployed Models

```bash
# List all deployed models
./scripts/list-deployed-models.sh

# List only configured models
./scripts/list-deployed-models.sh /all

# Search for specific model
./scripts/list-deployed-models.sh gpt-5-nano

# Show help
./scripts/list-deployed-models.sh --help
```

---

## 🏗️ Architecture

```text
AI Client → Proxy Server → [Model Pool] → SAP AI Core → AI Models
                        ↘ [Direct API] ↗
```

### Key Features

- **Model Pooling**: Reuses model instances per type for optimal performance
- **Multi-Model Support**: GPT-5 nano, Claude 4 Sonnet, Gemini 2.5 Flash
- **Intelligent Routing**: Automatic routing between provider and direct API models
- **Enterprise Ready**: Thread-safe operations, graceful shutdown, monitoring

### The proxy

1. **Receives** OpenAI-compatible requests from AI clients
2. **Validates** input and routes to appropriate handler
3. **Authenticates** with SAP AI Core using OAuth (with caching)
4. **Pools** model instances for performance optimization
5. **Transforms** requests to SAP AI Core format
6. **Returns** responses in OpenAI-compatible format

---

## 🚀 Performance Features

- **True Streaming Support**: Real-time token streaming for supported models (GPT-5 nano)
- **Intelligent Streaming Fallback**: Mock streaming for non-streaming models (Claude, Gemini)
- **Zero Process Spawning**: Model instances pooled and reused
- **Thread-Safe Token Management**: Race condition prevention
- **Automatic Cleanup**: Idle model instances cleaned up after 30 minutes
- **Real-time Monitoring**: Health checks with model pool statistics
- **Graceful Shutdown**: Proper resource cleanup on termination

---

## 🔗 Related Projects

For alternative implementations and approaches to SAP AI Core integration, you may also be interested in:

- **[SAP AI Core Proxy](https://github.com/kaimerklein/sap-ai-core-proxy)** - Another SAP AI Core proxy implementation with different architectural choices

---

## 📖 Detailed Documentation

See [CLAUDE.md](./CLAUDE.md) for comprehensive documentation including:

- Technical implementation details
- Troubleshooting guide
- Architecture decisions
- Lessons learned
