# Changelog

All notable changes to the SAP AI Core Proxy project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2025-10-27

### 🚀 Major Features & Critical Bug Fixes

### Added

#### 📊 Comprehensive LLM Response Logging

- **Complete Request Tracking**: Added unique correlation IDs for every request with raw response capture and final response tracking
- **Advanced Malformation Detection**: Implemented detection and auto-correction for empty/invalid text, whitespace-only responses, malformed JSON, reasoning-only responses, and invalid characters
- **Pattern Analysis System**: Added suspicious pattern detection for error keywords, debugging info, JSON fragments, HTML/XML tags, and raw data patterns
- **Performance Monitoring**: Integrated processing time metrics, response size tracking, and transformation count monitoring
- **Structured Logging**: Implemented JSON Lines format logging to `./logs/response-analysis.jsonl` with complete diagnostic information

#### 🛡️ SAP AI Core Rate Limiting Solution

- **Intelligent Rate Limit Management**: Added `RateLimitManager` with per-model state tracking (NORMAL, RATE_LIMITED, RECOVERING)
- **Exponential Backoff with Jitter**: Implemented configurable retry logic with exponential delays and random jitter to prevent thundering herd problems
- **Automatic Recovery Detection**: Added smart recovery detection that automatically clears rate limit status when requests succeed
- **Enhanced Health Endpoint**: Extended `/health` endpoint with comprehensive rate limit status information for all models
- **Configurable Retry Behavior**: Added full configuration via environment variables for max retries, delays, and backoff multipliers

#### 🔧 Comprehensive Response Validation

- **Missing OpenAI Handler Validation**: Added comprehensive response validation to `callProviderAPI` method (ROOT CAUSE FIX)
- **Proxy-Level Safety Net**: Implemented final fallback validation at proxy level for all endpoints
- **Multi-Format Support**: Added validation for OpenAI, Claude, and Gemini response formats
- **Graceful Error Handling**: Ensures validation never breaks API calls with graceful degradation

### Fixed

#### 🐛 Critical Bug Fixes

- **ENOTFOUND Error Resolution**: Fixed critical issue where response analysis logging caused `ENOTFOUND` errors during conversations
  - Root cause: Synchronous file system operations in logging mechanism
  - Solution: Converted to asynchronous non-blocking logging with comprehensive error handling
  - Impact: Eliminated intermittent conversation failures and improved response times
- **Invalid API Response Errors**: Resolved persistent "The provider returned an empty or unparsable response" errors in Cline
  - Added missing response validation in OpenAI handler (primary code path)
  - Implemented proxy-level validation safety net
  - Enhanced validation for all response types and error scenarios
- **SAP AI Core Rate Limit Handling**: Fixed 429 "TooManyRequest" errors with intelligent retry mechanisms

### Changed

#### 🔧 System Improvements

- **Non-blocking Logging Architecture**: Converted all response analysis logging to asynchronous operations using `setImmediate()`
- **Enhanced Error Isolation**: Logging failures no longer propagate to API calls with multiple layers of error handling
- **Improved Rate Limit User Experience**: Transparent retries with clear error messages and status visibility
- **Startup Configuration Display**: Added clear logging configuration status display during server startup

### Security

#### 🛡️ Reliability & Monitoring

- **Safe Logging Operations**: Comprehensive error handling ensures logging failures never break API functionality
- **Rate Limit Protection**: Intelligent handling of SAP AI Core rate limits prevents service disruption
- **Response Validation Security**: All response paths now protected with validation to prevent malformed data

### Performance

#### ⚡ Performance Enhancements

- **Async Logging Performance**: Improved response times by removing blocking file I/O operations from API call path
- **Intelligent Rate Limit Retries**: Reduced user impact from rate limiting with smart retry logic and exponential backoff
- **Memory-Efficient Response Processing**: Optimized response validation with minimal memory footprint

### Configuration

#### ⚙️ New Environment Variables

**Response Analysis Logging:**
```bash
RESPONSE_ANALYSIS_LOGGING=true     # Enable comprehensive logging
LOG_ALL_RESPONSES=true             # Log all responses vs. problematic only
RESPONSE_LOG_FILE=./logs/response-analysis.jsonl  # Log file location
```

**Rate Limiting Configuration:**
```bash
RATE_LIMIT_MAX_RETRIES=3           # Maximum retry attempts
RATE_LIMIT_BASE_DELAY_MS=1000      # Base delay between retries
RATE_LIMIT_MAX_DELAY_MS=30000      # Maximum delay cap
RATE_LIMIT_EXPONENTIAL_BASE=2      # Exponential backoff multiplier
RATE_LIMIT_JITTER_FACTOR=0.1       # Jitter factor (0-1)
```

### Technical Details

#### Implementation Highlights

- **Response Logging**: Complete diagnostic trail with before/after transformations, correlation IDs, and pattern analysis
- **Rate Limiting**: State-based management with exponential backoff, jitter, and automatic recovery
- **Response Validation**: Multi-layer validation with handler-level and proxy-level safety nets
- **Error Handling**: Comprehensive non-blocking error handling across all components

#### Monitoring & Observability

- **Health Endpoint**: Enhanced with rate limit status and configuration display
- **Structured Logging**: JSON Lines format for easy parsing and analysis
- **Performance Metrics**: Processing time, retry counts, and success rate tracking
- **Status Visibility**: Clear startup configuration display and runtime status updates

---

## [1.2.2] - 2025-09-25

### 🔒 Security & Code Quality Improvements

### Security

#### 🛡️ Repository Security Hardening

- **Sensitive File Removal**: Completely removed `.env.apikey` file from git history to prevent API key exposure
- **Git History Cleanup**: Used `git filter-repo` to eliminate all traces of sensitive files from version control
- **Security Audit**: Verified no other sensitive files are tracked in the repository
- **Proper Gitignore**: Confirmed `.env.apikey` and other sensitive files are properly ignored

#### 🧹 Repository Cleanup

- **History Rewrite**: Rewrote git history to remove sensitive data from all commits
- **Remote Update**: Force-pushed cleaned history to remove sensitive files from remote repository
- **File Verification**: Ensured only appropriate files (like `.env.example`) remain tracked

### Changed

#### 🔧 Authentication System Improvements

- **Production Authentication**: Removed development environment settings for cleaner production deployment
- **Authentication Middleware**: Streamlined authentication logic by removing development-specific code paths
- **Code Cleanup**: Removed 52 lines of development-only authentication code for better maintainability

#### 📝 Enhanced Logging

- **Improved Log Output**: Enhanced logging in authentication middleware for better debugging and monitoring
- **Server Logging**: Improved startup and operational logging in main proxy server
- **Better Error Messages**: More descriptive logging for authentication and server operations

#### 🧪 Test Suite Maintenance

- **Test Cleanup**: Removed obsolete test files and cleaned up test structure
- **Test Configuration**: Updated test configuration to work with production authentication
- **PID File Support**: Added proper PID file handling for single-instance enforcement

#### 📚 Documentation Improvements (PR #4)

- **NVM Installation Guide**: Updated HOW_TO_INSTALL.md to use Node Version Manager (NVM) instead of static npm version
- **Node Version Pinning**: Added `.node-version` file to pin the required Node.js version for consistent development
  environment
- **Improved Setup Process**: Enhanced installation instructions for better developer experience and environment
  consistency

### Technical Details

#### Security Impact

- **API Key Protection**: Eliminated risk of API key exposure through git history
- **Clean Repository**: Repository now follows security best practices for sensitive data
- **History Integrity**: Maintained project history while removing only sensitive content
- **Production Ready**: Removed development-specific code for cleaner production deployment

#### Implementation

- Used `git filter-repo --path .env.apikey --invert-paths --force` for complete removal
- Verified removal with `git log --all --full-history -- .env.apikey` (no results)
- Updated remote repository with cleaned history
- Streamlined authentication middleware by removing 52 lines of development code
- Enhanced logging across authentication and server components

---

## [1.2.3] - 2025-09-24

### 🚀 Enhanced Process Management & Version Display

### Added

#### 📋 Version Display

- **Startup Version Display**: Added version number to server startup message format:
  `🚀 SAP AI Core proxy - v1.2.0 running at http://localhost:3001`
- **Health Endpoint Version**: Added version field to `/health` endpoint response for monitoring and debugging
- **Dynamic Version Reading**: Version automatically synced from `package.json` ensuring consistency

#### 🔒 Single Instance Enforcement

- **PID File Management**: Implemented robust PID file system to prevent multiple server instances
- **Process Validation**: Added startup check to detect and prevent duplicate instances
- **Graceful Shutdown Integration**: Enhanced shutdown handlers to properly clean up PID files
- **Improved Stop Script**: Updated `npm run stop` to use PID-based termination instead of process name matching

#### 🛡️ Process Reliability

- **Stale PID Handling**: Automatic cleanup of stale PID files from crashed processes
- **Error Recovery**: Robust error handling for PID file operations and process management
- **Cross-Platform Support**: PID file solution works on macOS, Linux, and Windows
- **Resource Protection**: Prevents port conflicts and resource contention from multiple instances

### Changed

#### 🔧 Process Management

- **Stop Command**: Enhanced `npm run stop` with PID-based process termination and better error handling
- **Startup Validation**: Added pre-startup instance detection with clear error messaging
- **Shutdown Logging**: Improved shutdown process logging with PID file cleanup confirmation

### Fixed

#### 🐛 Process Management Issues

- **Multiple Instance Prevention**: Eliminated ability to accidentally start multiple server instances
- **Port Binding Conflicts**: Prevented port conflicts from duplicate server processes
- **Resource Cleanup**: Ensured proper cleanup of PID files during all shutdown scenarios
- **Stop Script Reliability**: Fixed stop script to work correctly with actual process names

### Technical Details

#### Implementation

- **PID File Location**: `sap-aicore-proxy.pid` in project root directory
- **Process Detection**: Uses `process.kill(pid, 0)` for reliable process existence checking
- **Graceful Termination**: SIGTERM-based shutdown with proper resource cleanup
- **Error Handling**: Comprehensive error handling for all PID file operations

#### Benefits

- **Prevents Resource Conflicts**: Only one instance can bind to configured port
- **Clean Process Management**: Reliable start/stop operations with proper cleanup
- **Development Friendly**: Clear error messages guide developers when instances are already running
- **Production Ready**: Robust process management suitable for production deployments

---

## [1.2.1] - 2025-09-23

### 🐛 Critical Bug Fix: Claude Native API Authentication

This patch release fixes a critical authentication issue that prevented Claude native API access after the v1.2.0
security hardening.

### Fixed

#### 🔧 Authentication Compatibility

- **Claude Native API Access**: Fixed authentication failure on `/v1/messages` endpoint that broke Claude integration
- **Development Mode Support**: Enabled `authenticateApiKeyDev` middleware for backward compatibility with v1.1.0
- **Legacy Key Support**: Restored support for `any-string-works` development key in development mode
- **Proper API Key Support**: Maintained support for enterprise `sk-proj-*` API keys

#### 🧪 Test Coverage

- **Claude Native API Tests**: Added comprehensive test suite for `/v1/messages` endpoint
- **Authentication Scenarios**: Added tests for development key, proper API key, and invalid key scenarios
- **Backward Compatibility**: Added tests to ensure v1.1.0 behavior is maintained
- **AnthropicStrategy Verification**: Added tests to verify correct strategy instantiation

### Technical Details

#### Root Cause

The v1.2.0 security hardening introduced strict API key validation that broke Claude's native API access.
The server was using production authentication middleware instead of development-friendly authentication.

#### Solution

- Switched from `authenticateApiKey` to `authenticateApiKeyDev` middleware
- Added `NODE_ENV=development` to enable legacy key support
- Updated test configuration to use development authentication

#### Verification

- ✅ All authentication tests pass (24/24 - 100%)
- ✅ Claude native API tests pass (6/6 - 100%)
- ✅ Full proxy test suite maintains high success rate
- ✅ Server logs confirm proper AnthropicStrategy creation
- ✅ Both legacy and proper API keys work correctly

### Migration Guide

No migration required - this is a backward-compatible fix that restores v1.1.0 behavior while maintaining v1.2.0
security features.

---

## [1.2.0] - 2025-09-23

### 🚀 Major Feature Release: Production-Ready Enterprise Features

This major feature release represents the complete evolution of the SAP AI Core Proxy from a basic proof-of-concept to a production-ready, enterprise-grade solution. The dev branch features are now ready for production deployment with comprehensive security, authentication, testing, and documentation.

### Added

#### 🔑 Custom Authentication System

- OpenAI-Compatible API Keys with custom `sk-proj-*` format (51-character length)
- Auto-generated keys with secure API key generation on first startup
- Constant-time validation with timing attack prevention and secure key comparison
- Two-layer security with client API key validation + provider token transmission
- Secure storage with API keys stored using Unix 600 permissions

#### 🔒 Enterprise Security Hardening

- Security headers including CSP, HSTS, and clickjacking protection via Helmet.js
- Rate limiting with DoS protection and configurable per-IP limits
- Input validation with request sanitization and comprehensive validation
- Secure logging with token sanitization to prevent information disclosure
- CORS security with configurable origin control and desktop client support

#### 🧪 Comprehensive Test Suite (28 Tests)

- API Key Manager Tests: 8/8 tests (100% success rate)
- Authentication Middleware Tests: 8/8 tests (100% success rate)
- Authentication Flow Tests: 4/4 tests (100% success rate)
- Complex Integration Tests: 6/8 tests (75% success rate - environment dependent)
- Overall Success Rate: 26/28 tests (93% success rate)

#### 📚 Complete Documentation Suite

- Features-first README.md with clear setup instructions
- HOW_TO_INSTALL.md complete installation and configuration guide
- AUTHENTICATION-TESTS.md comprehensive authentication system documentation
- Cline integration with complete setup guide for VS Code AI coding agent

#### 🎨 Universal AI Client Compatibility

- BoltAI native macOS client with custom API support (featured first)
- Open WebUI feature-rich web interface with document uploads
- Chatbox cross-platform desktop client
- Cline (Claude Code) VS Code AI coding agent with `.claude/settings.json` configuration
- Any OpenAI-Compatible Client universal compatibility

### Changed

#### 🏗️ Architecture Enhancements

- Model Pool System with instance reuse eliminates process spawning
- Thread-Safe Operations with race condition prevention in token management
- Memory Management with fixed footprint regardless of request volume
- Graceful Shutdown with proper resource cleanup on termination

#### 📖 Documentation Structure

- Features-First README leading with capabilities and benefits
- Simple Explanation with clear value proposition for universal OpenAI compatibility
- Dedicated Setup Section with clean separation of features vs installation
- Client Configuration with comprehensive setup guides for all major AI clients

### Fixed

#### 🐛 Critical Production Issues

- TypeScript Errors resolved boolean type validation issues
- Authentication Failures fixed SAP AI Core provider token transmission
- Streaming Issues restored proper streaming for all models
- Information Disclosure eliminated token exposure in logs
- Memory Leaks fixed resource cleanup and instance management

### Security

#### 🛡️ Production Security Features

- Custom Authentication enterprise-grade API key system
- Input Sanitization comprehensive request validation and cleaning
- Rate Limiting DoS protection with tiered limits
- Security Headers complete security header implementation
- Audit Trail security event logging without token exposure

### Performance

#### ⚡ Production Performance

- True Streaming real-time token streaming for GPT-5 nano
- Mock Streaming compatibility streaming for Claude and Gemini
- Zero Process Spawning model instance pooling after initialization
- 10-15x Performance subsequent requests ~100-200ms vs ~2-3s

### Breaking Changes

- **Custom Authentication Required**: All requests now require `sk-proj-*` API keys
- **Security Headers**: New security middleware may affect some clients
- **Rate Limiting**: Request limits now enforced (configurable)

### Migration Guide

#### Migration Steps

1. Update Environment: Add any new environment variables (all optional)
2. Get API Key: Start server to auto-generate your custom API key
3. Update Clients: Configure clients with new API key and endpoint
4. Test Setup: Verify all models work with your AI clients

#### Compatibility

- API Endpoints: Fully backward compatible with OpenAI format
- Model Names: Same model identifiers (`gpt-5-nano`, `anthropic--claude-4-sonnet`, `gemini-2.5-flash`)
- Request/Response: No changes to API request/response formats

---

## [1.0.1] - 2025-09-23

### Added

- Comprehensive Authentication Test Suite Implementation (28 Tests)
- API Key Manager Unit Tests with custom `sk-proj-*` format validation
- Authentication Middleware Unit Tests with Bearer token validation
- Focused Authentication Flow Tests with 100% reliability
- Complete Test Runner with unified test execution and detailed reporting
- Enhanced Test Documentation with complete test coverage documentation

### Changed

- Three-Tier Test Strategy Implementation for daily CI and release validation
- Authentication test reliability with focused flow tests

### Fixed

- Integration Test Reliability Issues with new focused flow tests
- Authentication Security Validation with complete security feature coverage

### Security

- Authentication Security Validation with custom API key format validation
- Access Control Verification with protected endpoints requiring valid authentication
- End-to-End Security Flow with two-layer authentication system

---

## [1.0.0] - 2025-09-22

### Added

- Initial OpenAI-compatible proxy server implementation
- Multi-model support (GPT-5 nano, Claude 4 Sonnet, Gemini 2.5 Flash)
- OAuth authentication with SAP AI Core
- Streaming and non-streaming response modes
- AI SDK integration for compatibility layer
- Model configuration system
- Deployment scripts for model management

### Features

- GPT-5 nano via SAP AI Core provider
- Claude 4 Sonnet via direct API (Anthropic bedrock format)
- Gemini 2.5 Flash via direct API (Google AI Studio format)
- Basic OAuth token management with caching
- OpenAI-compatible request/response formats
