# SAP AI Core Proxy 🚀

A high-performance, enterprise-grade proxy server that provides OpenAI-compatible API access to SAP AI Core's AI deployed models with comprehensive security hardening and authentication.

## 🎯 What This Proxy Does

**Simple explanation:** This proxy lets you use your SAP AI Core models (like GPT-5 nano, Claude 4 Sonnet, Gemini 2.5 Flash) with any OpenAI-compatible AI application.

### Why Use This Proxy?

- **🔌 Universal Compatibility**: Your SAP AI Core models work with **any** OpenAI-compatible app
- **🎨 Use Your Favorite AI Apps**: BoltAI, Open WebUI, Chatbox, Cline, and hundreds of other AI tools
- **💰 Cost Effective**: Use your existing SAP AI Core deployment instead of paying for separate API access
- **🔒 Enterprise Security**: Custom authentication and security hardening for business use
- **🚀 Easy Setup**: Install once, configure once, use everywhere

### How It Works

1. **Install & Run**: Set up the proxy once with your SAP AI Core credentials
2. **Get API Key**: Proxy generates a custom OpenAI-compatible API key  
3. **Connect Any App**: Use `http://localhost:3001` as your OpenAI API endpoint
4. **Start Chatting**: Your AI apps now use your SAP AI Core models seamlessly

**Result**: Every OpenAI-compatible AI application becomes compatible with your SAP AI Core deployment.

### 1. OpenAI-Compatible API (Default)
**Endpoint:** `POST /v1/chat/completions`

## 🎯 Supported Models

- ✅ **`gpt-5-nano`** - OpenAI GPT-5 nano via SAP AI Core provider
  - **🌊 True Streaming** - Real-time token-by-token streaming
  - **⚪ Text-only** - Text processing capabilities

- ✅ **`anthropic--claude-4-sonnet`** - Anthropic Claude 4 Sonnet via direct API
  - **📦 Mock Streaming** - Complete response sent as streaming chunks
  - **👁️ Vision Support** - Image analysis and understanding

- ✅ **`gemini-2.5-flash`** - Google Gemini 2.5 Flash via direct API
  - **📦 Mock Streaming** - Complete response sent as streaming chunks
  - **👁️ Vision Support** - Image analysis and understanding

**All API formats work with all models:**
- Use Claude format with Gemini models
- Use Gemini format with Claude models  
- Use OpenAI format with any model
- Automatic format conversion between APIs

## 🔒 Security Features

### Enterprise-Grade Security
- **Custom Authentication**: Two-layer authentication (client key + provider tokens)
- **Security Headers**: CSP, HSTS, clickjacking protection via Helmet.js
- **Rate Limiting**: DoS protection with configurable per-IP limits
- **Input Validation**: Request sanitization and validation
- **Secure Logging**: Token sanitization prevents information disclosure
- **CORS Security**: Configurable origin control

### Custom API Key System
- **Format**: `sk-proj-[43-character-base64url-string]`
- **Example**: `sk-proj-KEiBe1MO4JWCQLKfwZFO06G5OPlJR0rSxgqGgF6A9hI`
- **Auto-generated**: API key is created automatically on first startup
- **Security**: Constant-time validation prevents timing attacks

---

## 🚀 Performance Features

### Optimization
- **True Streaming**: Real-time token streaming (GPT-5 nano)
- **Mock Streaming**: Compatibility layer for non-streaming models
- **Zero Process Spawning**: Model instances pooled and reused
- **Automatic Cleanup**: Idle instances cleaned after 30 minutes
- **Real-time Monitoring**: Health checks with statistics

### Production Ready
- **Thread-Safe Token Management**: Prevents authentication failures
- **Configuration Validation**: Startup checks prevent deployment issues
- **Memory Management**: Fixed footprint regardless of request volume
- **Error Handling**: Graceful recovery with detailed logging

---

## 👁️ Vision Support

**Claude 4 Sonnet** and **Gemini 2.5 Flash** support image analysis:

- **Supported formats**: PNG, JPG, JPEG, WebP, GIF
- **Upload methods**: Direct upload or base64 data URLs
- **Multi-image support**: Multiple images per conversation
- **Format conversion**: Automatic conversion between providers

---

## 📁 File Support

### File Processing Features
- **Text Files**: Automatic content extraction for document analysis
- **Image Files**: Full vision support with format conversion
- **Base64 Encoding**: Support for base64-encoded data
- **Large Files**: Configurable size limits (default: 50MB)
- **Security Validation**: Content validation and sanitization
- **Intelligent Routing**: Auto-routes images to vision-capable models

---

## 🏗️ Architecture

```text
AI Client → [Authentication] → [Security Middleware] → Proxy Server → SAP AI Core
                ↓                      ↓                    ↓
        [Rate Limiting]        [Input Validation]    [Model Pool]
```

### Key Features
- **Custom Authentication**: `sk-proj-*` API key system
- **Security Hardening**: Complete security middleware stack
- **Model Pooling**: Instance reuse for optimal performance
- **Intelligent Routing**: Automatic routing between provider and direct API
- **Thread-Safe Operations**: Race condition prevention
- **Graceful Shutdown**: Proper resource cleanup

---

## ⚙️ Setup

### Installation & Configuration

**Complete setup guide**: [HOW_TO_INSTALL.md](./HOW_TO_INSTALL.md)

The installation guide covers:
- Development tools setup (Node.js, npm, git)
- Project setup and dependency installation
- Environment configuration with SAP AI Core credentials
- Server startup and API key generation
- Client configuration and testing

### Quick Setup Summary

1. **Install**: Follow [HOW_TO_INSTALL.md](./HOW_TO_INSTALL.md) for complete setup
2. **Configure**: Set up `.env` with your SAP AI Core credentials
3. **Start**: `npm start` (API key auto-generated on first run)
4. **Connect**: Configure your AI client with the generated API key

---

## 📱 Client Configuration

Configure your OpenAI-compatible AI client:

- **API Host**: `http://localhost:3001`
- **API Path**: `/v1`
- **API Key**: Your custom API key (displayed on startup or in `.env.apikey`)
- **Models**: `gpt-5-nano`, `anthropic--claude-4-sonnet`, `gemini-2.5-flash`

### Compatible AI Clients

- **[BoltAI](https://boltai.com/)** - Native macOS AI client with ChatGPT, Claude, and custom API support
- **[Open WebUI](https://docs.openwebui.com/)** - Feature-rich web interface with document uploads
- **[Chatbox](https://chatboxai.app/)** - Cross-platform desktop client
- **[Cline (Claude Code)](https://docs.cline.bot/provider-config/claude-code)** - VS Code AI coding agent with custom API support
- **Any OpenAI-compatible client**

### Configuring Cline (Claude Code) with the Proxy

You can configure [Cline](https://docs.cline.bot/) to use your SAP AI Core proxy for Claude models by creating a `.claude/settings.json` file:

```json
{
  "env": {
    "ANTHROPIC_MODEL": "anthropic--claude-4-sonnet",
    "ANTHROPIC_SMALL_FAST_MODEL": "anthropic--claude-4-sonnet", 
    "ANTHROPIC_AUTH_TOKEN": "your-proxy-api-key-here",
    "ANTHROPIC_BASE_URL": "http://localhost:3001/"
  }
}
```

**Configuration Details:**
- **ANTHROPIC_MODEL**: Use `anthropic--claude-4-sonnet` for the main Claude model
- **ANTHROPIC_SMALL_FAST_MODEL**: Use the same model for fast responses
- **ANTHROPIC_AUTH_TOKEN**: Replace with your custom API key from `.env.apikey`
- **ANTHROPIC_BASE_URL**: Point to your running proxy server

**Tutorial**: For detailed setup instructions, see [Cline's Claude Code documentation](https://docs.cline.bot/provider-config/claude-code).

**Benefits of using the proxy with Cline:**
- Access Claude 4 Sonnet through your SAP AI Core deployment
- Vision support for image analysis in your coding projects
- No additional API costs beyond your SAP AI Core usage
- Enterprise-grade security with your custom authentication system

## 🚀 Automatic Deployment ID Discovery

## 🛠️ Commands

### Server Management
- `npm start` - Start proxy server with security features
- `npm run dev` - Start in development mode with hot reload
- `npm stop` - Stop the proxy server

### API Key Management
```bash
# View your API key
cat .env.apikey

# Regenerate API key if needed
rm .env.apikey && npm start
```

### Monitoring
- `curl http://localhost:3001/health` - Server health and statistics
- `curl -H "Authorization: Bearer your-api-key" http://localhost:3001/v1/models` - List models

### Model Management
- `./scripts/deploy-model.sh <model-name>` - Check model deployment status
- `./scripts/list-deployed-models.sh` - List deployed models

---

## 🔧 Environment Configuration

### Required Configuration
```env
# SAP AI Core (Required)
AICORE_AUTH_URL=https://your-auth-url.hana.ondemand.com
AICORE_CLIENT_ID="your-client-id"
AICORE_CLIENT_SECRET="your-client-secret"
AICORE_BASE_URL=https://api.ai.your-region.aws.ml.hana.ondemand.com
```

### Optional Security Configuration
```env
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100          # Max requests per window
AI_RATE_LIMIT_WINDOW_MS=300000       # 5 minutes for AI endpoints
AI_RATE_LIMIT_MAX_REQUESTS=20        # Max AI requests per window

# Input Validation
MAX_MESSAGES_PER_REQUEST=50          # Max messages per request
MAX_CONTENT_LENGTH=50000             # Max characters per message
MAX_REQUEST_SIZE=52428800            # Max request size (50MB)

# CORS Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

### Optional Server Configuration
```env
# Server Settings
PORT=3001
HOST=localhost
CORS_ORIGIN=*

# Model Defaults
DEFAULT_MODEL=gpt-5-nano
DEFAULT_MAX_TOKENS=1000

# Performance
MODEL_POOL_MAX_IDLE_TIME=1800000
MODEL_POOL_CLEANUP_INTERVAL=300000
```

**Note**: All optional settings have sensible defaults. See [HOW_TO_INSTALL.md](./HOW_TO_INSTALL.md) for complete configuration guide.

---

## 🏆 Production Ready

The dev branch is **enterprise-ready** with:

- ✅ **Security**: Custom authentication, rate limiting, security headers
- ✅ **Performance**: Model pooling, streaming, memory management  
- ✅ **Reliability**: Comprehensive test coverage (28 authentication tests)
- ✅ **Monitoring**: Health checks and detailed statistics
- ✅ **Documentation**: Complete guides and troubleshooting

### Key Differences from Main Branch
- **Custom Authentication System** with `sk-proj-*` API keys
- **Security Hardening** with middleware stack
- **Comprehensive Testing** with 28 authentication tests
- **Enhanced Configuration** with additional security options
- **Production Features** including monitoring and validation

**See what's new**: Check [CHANGELOG.md](./CHANGELOG.md) for detailed feature evolution and recent updates.

- Technical implementation details
- Troubleshooting guide
- Architecture decisions
- Lessons learned

## 📚 Documentation

### Complete Guides
- **[HOW_TO_INSTALL.md](./HOW_TO_INSTALL.md)** - Complete installation and setup guide
- **[CLAUDE.md](./CLAUDE.md)** - Technical implementation details
- **[CHANGELOG.md](./CHANGELOG.md)** - Version history and features
- **[tests/AUTHENTICATION-TESTS.md](./tests/AUTHENTICATION-TESTS.md)** - Authentication system details

### Development & Testing
For development and testing information, see [tests/AUTHENTICATION-TESTS.md](./tests/AUTHENTICATION-TESTS.md).

---

## 📞 Support

- **Setup Guide**: [HOW_TO_INSTALL.md](./HOW_TO_INSTALL.md)
- **Bug Reports**: Use `/reportbug` in supported clients
- **Technical Details**: [CLAUDE.md](./CLAUDE.md)
- **Authentication Help**: [tests/AUTHENTICATION-TESTS.md](./tests/AUTHENTICATION-TESTS.md)
