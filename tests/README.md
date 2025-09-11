# SAP AI Core Proxy Test Suite

A comprehensive test suite for the SAP AI Core proxy that validates connection, text processing, image processing, response validation, error handling, and performance across all supported models.

## Overview

This test suite provides thorough testing of the SAP AI Core proxy functionality with focus on:

- **Connection Testing**: Proxy health, model availability, and basic connectivity
- **Text Processing**: Simple text, system prompts, conversations, long text, Unicode, and streaming
- **Image Processing**: Vision capabilities, single/multiple images, invalid image handling
- **Response Validation**: OpenAI schema compliance, field validation, usage statistics
- **Error Handling**: Invalid requests, authentication, timeouts, rate limiting
- **Performance Testing**: Response times, concurrent requests, memory usage, throughput

## Quick Start

### Prerequisites

1. Ensure the SAP AI Core proxy is running:
   ```bash
   npm run proxy
   ```

2. Set up environment variables in `.env`:
   ```bash
   PROXY_URL=http://localhost:3001
   API_KEY=your-api-key
   ```

### Running Tests

**Using the test runner script (recommended):**
```bash
# Run all tests with automatic proxy management
npm run test:full

# Run tests with detailed report generation
npm run test:report

# Use the script directly for more options
./scripts/run-tests.sh --help
```

**Direct npm commands:**
```bash
npm test                    # Run all tests
npm run test:connection     # Connection tests only
npm run test:text          # Text processing tests only
npm run test:image         # Image processing tests only
npm run test:validation    # Response validation tests only
npm run test:error         # Error handling tests only
npm run test:performance   # Performance tests only
```

**Advanced script usage:**
```bash
# Start proxy, run tests, stop proxy automatically
./scripts/run-tests.sh -s -k all

# Run specific category with verbose output
./scripts/run-tests.sh -v connection

# Generate detailed report
./scripts/run-tests.sh -r performance

# Continuous testing (watch mode)
./scripts/run-tests.sh -c all

# Custom timeout
./scripts/run-tests.sh --timeout 600 performance
```

## Test Structure

```
tests/
├── utils/
│   ├── test-data.ts       # Test images, messages, and configuration
│   └── test-helpers.ts    # HTTP client, validators, and utilities
├── unit/
│   ├── connection-tests.ts         # Basic connectivity tests
│   ├── text-processing-tests.ts    # Text handling tests
│   ├── image-processing-tests.ts   # Vision capability tests
│   └── response-validation-tests.ts # Response format validation
├── integration/
│   └── error-handling-tests.ts     # Error scenarios and edge cases
├── performance/
│   └── load-tests.ts               # Performance and load testing
├── proxy-test-suite.ts             # Main test orchestrator
└── README.md                       # This documentation
```

## Test Categories

### 1. Connection Tests (`test:connection`)

Tests basic proxy functionality and model availability:

- **Proxy Health Check**: Validates `/health` endpoint
- **Models List**: Verifies `/v1/models` endpoint returns expected models
- **Model Connections**: Tests basic connectivity to each model

**Expected Models:**
- `gpt-5-nano` (Provider API, Vision + Streaming)
- `anthropic--claude-4-sonnet` (Direct API, Vision)
- `gemini-2.5-flash` (Direct API, Text-only)

### 2. Text Processing Tests (`test:text`)

Tests various text processing scenarios:

- **Simple Text**: Basic message handling
- **System Prompts**: System message adherence
- **Conversations**: Multi-turn conversation context
- **Long Text**: Large input handling
- **Unicode Text**: International characters and emojis
- **Empty Text**: Edge case handling
- **Streaming**: Real-time response streaming (where supported)

### 3. Image Processing Tests (`test:image`)

Tests vision capabilities and image handling:

- **Single Image**: Basic vision processing
- **Multiple Images**: Comparison and analysis
- **Long Text + Image**: Combined text and vision
- **Invalid Images**: Error handling for corrupted images
- **Non-Vision Models**: Appropriate rejection of image content

**Test Images:**
- Red, blue, yellow, green pixels (1x1 PNG)
- Checkerboard pattern (2x2 PNG)
- Invalid base64 data for error testing

### 4. Response Validation Tests (`test:validation`)

Validates OpenAI API compatibility:

- **Schema Validation**: Required fields (`id`, `object`, `created`, `model`, `choices`)
- **Field Validation**: Data types and formats
- **Usage Statistics**: Token counting (`prompt_tokens`, `completion_tokens`, `total_tokens`)
- **Timestamp Validation**: Reasonable time bounds
- **Content Validation**: Message structure and roles

### 5. Error Handling Tests (`test:error`)

Tests error scenarios and edge cases:

- **Invalid Model**: Non-existent model names
- **Malformed Requests**: Invalid JSON, missing fields, empty messages
- **Authentication**: Invalid API keys
- **Timeouts**: Network timeout handling
- **Large Payloads**: Size limit testing
- **Invalid Images**: Corrupted image data for vision models
- **Rate Limiting**: Concurrent request limits

### 6. Performance Tests (`test:performance`)

Measures system performance and scalability:

- **Response Time**: Average response times per model
- **Concurrent Requests**: Parallel request handling
- **Memory Usage**: System resource monitoring
- **Throughput**: Requests per minute measurement
- **Streaming Performance**: Tokens per second for streaming models

## Configuration

### Test Configuration

The test suite uses the following default configuration:

```typescript
{
  proxyUrl: 'http://localhost:3001',
  apiKey: 'test-key',
  models: ['gpt-5-nano', 'anthropic--claude-4-sonnet', 'gemini-2.5-flash'],
  performance: {
    maxResponseTime: 30000,      // 30 seconds
    concurrentRequests: 5,       // Parallel requests
    throughputTestDuration: 30000, // 30 seconds
    memoryThreshold: 100 * 1024 * 1024 // 100MB
  }
}
```

### Environment Variables

- `PROXY_URL`: Proxy server URL (default: `http://localhost:3001`)
- `API_KEY`: Authentication key (default: `test-key`)

## Test Results

### Success Criteria

- **Overall Success**: ≥70% of tests pass
- **Connection Tests**: All basic connectivity tests must pass
- **Text Processing**: ≥70% success rate across all models
- **Image Processing**: ≥60% success rate (more lenient for vision)
- **Response Validation**: All schema validation tests must pass
- **Error Handling**: All error scenarios handled appropriately
- **Performance**: Response times within configured thresholds

### Report Format

The test suite generates a comprehensive report including:

```
📊 COMPREHENSIVE TEST REPORT
============================================================

🎯 Overall Results:
   Total Tests: 45
   ✅ Passed: 38
   ❌ Failed: 7
   ⏭️  Skipped: 0
   📈 Success Rate: 84.4%
   ⏱️  Total Duration: 2m 15s

📋 Suite Breakdown:
   Connection Tests: 5/5 (100.0%) - 12s
   Text Processing Tests: 18/21 (85.7%) - 45s
   Image Processing Tests: 8/10 (80.0%) - 38s
   Response Validation Tests: 12/15 (80.0%) - 22s
   Error Handling Tests: 6/7 (85.7%) - 18s
   Performance Tests: 4/5 (80.0%) - 1m 30s

⚡ Performance Metrics:
   Average Response Time: 2,340ms
   Min Response Time: 450ms
   Max Response Time: 8,920ms
   Throughput: 24.5 requests/minute

🎉 TEST SUITE PASSED - Proxy is functioning well!
```

## Model-Specific Behavior

### GPT-5 Nano
- **Type**: Provider API
- **Capabilities**: Text + Vision + Streaming
- **Expected**: Fast responses, good vision processing
- **Streaming**: Supported

### Claude 4 Sonnet
- **Type**: Direct API
- **Capabilities**: Text + Vision
- **Expected**: High-quality responses, excellent vision
- **Streaming**: Not supported

### Gemini 2.5 Flash
- **Type**: Direct API
- **Capabilities**: Text only (vision disabled)
- **Expected**: Fast text processing, rejects images
- **Streaming**: Not supported

## Troubleshooting

### Common Issues

1. **Connection Failures**
   - Ensure proxy is running on correct port
   - Check API key configuration
   - Verify model deployments in SAP AI Core

2. **Vision Test Failures**
   - Gemini 2.5 Flash should reject vision requests (expected)
   - Check base64 image encoding
   - Verify vision model capabilities

3. **Performance Issues**
   - Increase timeout thresholds for slow networks
   - Reduce concurrent request limits
   - Check system resources

4. **Authentication Errors**
   - Verify API key in environment variables
   - Check SAP AI Core authentication setup
   - Ensure proper token permissions

### Debug Mode

For detailed debugging, examine individual test files:

```bash
# Run with detailed output
node --import=tsx --env-file=.env ./tests/unit/connection-tests.ts

# Check specific model
node --import=tsx --env-file=.env ./tests/unit/text-processing-tests.ts
```

## Contributing

When adding new tests:

1. Follow the existing test structure and naming conventions
2. Add appropriate error handling and validation
3. Include performance considerations
4. Update this documentation
5. Ensure tests are deterministic and reliable

## Architecture

The test suite is built with:

- **TypeScript**: Type safety and modern JavaScript features
- **Modular Design**: Separate test categories for maintainability
- **Comprehensive Validation**: OpenAI schema compliance
- **Performance Monitoring**: Built-in metrics collection
- **Flexible Configuration**: Environment-based settings
- **Detailed Reporting**: Rich console output and error details

This test suite ensures the SAP AI Core proxy maintains high quality, performance, and compatibility standards across all supported AI models.
