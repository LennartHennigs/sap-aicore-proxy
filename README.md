# SAP AI Core Proxy 🚀

A simple proxy server that provides OpenAI-compatible API access to SAP AI Core's AI deployed models.

---

## 📋 Prerequisites

See [HOW_TO_INSTALL.md](./HOW_TO_INSTALL.md) for a complete installation guide.

## ⚡ Starting the Server

```bash
cd the_directory_where_you_installed_the_server
npm start
```

**The proxy will be available at `http://localhost:3001`**

**Server Management:**
- **`npm start`** - Start the proxy server (optimized with model pooling)
- **`npm stop`** - Stop the proxy server
- **`curl http://localhost:3001/health`** - Check server status

---

## 📱 Client Configuration

Configure your OpenAI-compatible AI client with these settings:

- **API Host**: `http://localhost:3001`
- **API Path**: `/v1`
- **API Key**: `any-string-works`
- **Model**: `gpt-5-nano` or `anthropic--claude-4-sonnet` or `gemini-2.5-flash`

### Compatible AI Clients

This proxy works with any OpenAI-compatible client. Here are some popular options:

- **[Open WebUI](https://docs.openwebui.com/)** - A feature-rich web interface for AI models with support for multiple providers, document uploads, and advanced conversation management
- **[Chatbox](https://chatboxai.app/)** - A cross-platform desktop AI client with a clean interface, conversation history, and support for multiple AI providers
- **[BoltAI](https://boltai.com/)** - A native macOS AI client with seamless integration, custom API support, and intuitive conversation management

Simply configure these clients with the proxy settings above to access SAP AI Core models through a familiar interface.

---

## 🛠️ Commands

### Server Management

- **`npm start`** - Start the proxy server (production mode with model pooling and optimization)
- **`npm run dev`** - Start in development mode with hot reload and file watching
- **`npm run proxy`** - Alias for `npm start`
- **`npm stop`** - Stop the running proxy server

**What `npm start` does:**
- Launches the proxy server at `http://localhost:3001`
- Enables model pooling for optimal performance
- Validates configuration on startup
- Provides OpenAI-compatible API endpoints at `/v1/*`


### Model Management

- `./scripts/deploy-model.sh <model-name> [--make-config] [--help]` - Check model deployment status
- `./scripts/list-deployed-models.sh [MODEL_NAME|/all] [--help]` - List deployed models

### Monitoring

- `curl http://localhost:3001/health` - Check server health and model pool statistics
- `curl http://localhost:3001/v1/models` - List available models (OpenAI-compatible)

---

## 🎯 Supported / Tested Models

- ✅ `gpt-5-nano` - OpenAI GPT-5 nano (working via SAP AI Core provider) **🌊 True Streaming** ⚪ Text-only
- ✅ `anthropic--claude-4-sonnet` - Anthropic Claude 4 Sonnet (working via direct API) **📦 Mock Streaming** **👁️ Vision**
- ✅ `gemini-2.5-flash` - Google Gemini 2.5 Flash (working via direct API) **📦 Mock Streaming** **👁️ Vision**

## ✨ Key Features

- **🌊 True Streaming**: Real-time token-by-token streaming for GPT-5 nano
- **📦 Mock Streaming**: Complete response sent as streaming chunks for Claude/Gemini compatibility
- **👁️ Vision Support**: Image analysis with Claude 4 Sonnet and Gemini 2.5 Flash (PNG, JPG, JPEG, WebP, GIF)
- **📁 File Upload**: Text documents and images with automatic content extraction
- **🔄 Model Pooling**: Reuses model instances for optimal performance
- **🎯 Intelligent Routing**: Automatic routing between SAP AI Core provider and direct APIs
- **🔍 Configuration Validation**: Comprehensive startup validation ensures proper setup
- **⚡ Enterprise Ready**: Thread-safe operations, graceful shutdown, monitoring
- **🔧 OpenAI Compatible**: Works with any OpenAI-compatible AI client
- **📊 Real-time Monitoring**: Health checks with model pool statistics

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
# List all deployed models with support indicators
./scripts/list-deployed-models.sh

# List only configured/supported models
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

## 🔗 Related Projects

For alternative implementations and approaches to SAP AI Core integration, you may also be interested in:

- **[SAP AI Core Proxy](https://github.com/kaimerklein/sap-ai-core-proxy)** - Another SAP AI Core proxy implementation with different architectural choices

---

## 📖 Detailed Documentation

See [CLAUDE.md](./CLAUDE.md) for comprehensive technical documentation including:

- Technical implementation details
- Troubleshooting guide
- Architecture decisions
- Lessons learned
