# SAP AI Core Rate Limiting Solution

This document describes the comprehensive rate limiting solution implemented to handle SAP AI Core API rate limits (429 errors) gracefully.

## Overview

SAP AI Core implements rate limiting on their inference endpoints to prevent abuse and ensure fair usage. When rate limits are exceeded, the API returns a 429 "TooManyRequest" error. This solution provides intelligent retry mechanisms with exponential backoff, state tracking, and user-friendly logging.

## Key Components

### 1. RateLimitManager (`src/utils/rate-limit-manager.ts`)

The central component that manages rate limit state for all models:

- **State Tracking**: Tracks each model's rate limit state (NORMAL, RATE_LIMITED, RECOVERING)
- **Retry Logic**: Implements exponential backoff with jitter
- **Recovery Detection**: Automatically detects when rate limits are cleared
- **Intelligent Logging**: Only logs state transitions to avoid log spam

#### States

```typescript
enum RateLimitState {
  NORMAL = 'NORMAL',           // Model is operating normally
  RATE_LIMITED = 'RATE_LIMITED', // Model is rate limited, retries ongoing
  RECOVERING = 'RECOVERING'    // Model is attempting recovery
}
```

### 2. DirectApiHandler Integration (`src/handlers/direct-api-handler.ts`)

Enhanced with comprehensive retry logic:

- **Pre-check**: Validates if model is available before making requests
- **Retry Loop**: Automatically retries failed requests with delays
- **Error Detection**: Identifies 429 errors and delegates to RateLimitManager
- **Success Handling**: Reports successful requests for recovery detection

### 3. Enhanced Logging (`src/utils/secure-logger.ts`)

Smart logging system that provides clear visibility without spam:

```
⚠️ RATE LIMIT: SAP AI Core rate limiting started for model 'claude-3-5-sonnet' (retry after 30s)
🔄 RATE LIMIT: Retrying model 'claude-3-5-sonnet' (attempt 2/3) in 4s
✅ RATE LIMIT: SAP AI Core rate limiting ended for model 'claude-3-5-sonnet' (duration: 2m 30s)
```

### 4. Configuration System (`src/config/app-config.ts`)

Fully configurable retry behavior via environment variables:

```bash
# Rate limiting configuration
RATE_LIMIT_MAX_RETRIES=3           # Maximum retry attempts
RATE_LIMIT_BASE_DELAY_MS=1000      # Base delay in milliseconds
RATE_LIMIT_MAX_DELAY_MS=30000      # Maximum delay cap
RATE_LIMIT_EXPONENTIAL_BASE=2      # Exponential backoff multiplier
RATE_LIMIT_JITTER_FACTOR=0.1       # Jitter factor (0-1)
```

## Features

### ✅ Intelligent Retry Logic

- **Exponential Backoff**: Delays increase exponentially (1s, 2s, 4s, 8s...)
- **Jitter**: Random variation prevents thundering herd problems
- **Retry-After Respect**: Honors server-provided retry delays
- **Max Delay Cap**: Prevents excessively long waits

### ✅ State Management

- **Per-Model Tracking**: Each model has independent rate limit state
- **Automatic Recovery**: Detects when rate limits clear
- **Persistent State**: Maintains state across requests
- **Manual Reset**: Admin can reset model states

### ✅ User Experience

- **Transparent Retries**: Users don't need to manually retry
- **Clear Error Messages**: Informative messages when limits exceeded
- **Status Visibility**: Health endpoint shows rate limit status
- **Minimal Disruption**: Automatic handling reduces user impact

### ✅ Monitoring & Observability

- **Health Endpoint**: `/health` includes rate limit status
- **Structured Logging**: Clear, actionable log messages
- **Metrics Tracking**: Duration, retry counts, success rates
- **Dashboard Ready**: Status data suitable for monitoring

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MAX_RETRIES` | `3` | Maximum number of retry attempts |
| `RATE_LIMIT_BASE_DELAY_MS` | `1000` | Base delay between retries (ms) |
| `RATE_LIMIT_MAX_DELAY_MS` | `30000` | Maximum delay cap (ms) |
| `RATE_LIMIT_EXPONENTIAL_BASE` | `2` | Exponential backoff multiplier |
| `RATE_LIMIT_JITTER_FACTOR` | `0.1` | Jitter factor (0.0-1.0) |

### Example Configuration

```bash
# Conservative settings (longer waits, more retries)
RATE_LIMIT_MAX_RETRIES=5
RATE_LIMIT_BASE_DELAY_MS=2000
RATE_LIMIT_MAX_DELAY_MS=60000
RATE_LIMIT_EXPONENTIAL_BASE=1.5
RATE_LIMIT_JITTER_FACTOR=0.2

# Aggressive settings (shorter waits, fewer retries)
RATE_LIMIT_MAX_RETRIES=2
RATE_LIMIT_BASE_DELAY_MS=500
RATE_LIMIT_MAX_DELAY_MS=10000
RATE_LIMIT_EXPONENTIAL_BASE=3
RATE_LIMIT_JITTER_FACTOR=0.05
```

## API Integration

### Health Endpoint

The `/health` endpoint now includes rate limit information:

```json
{
  "status": "OK",
  "rateLimit": {
    "config": {
      "maxRetries": 3,
      "baseDelayMs": 1000,
      "maxDelayMs": 30000,
      "exponentialBase": 2,
      "jitterFactor": 0.1
    },
    "modelStatus": {
      "claude-3-5-sonnet": {
        "state": "NORMAL",
        "isRateLimited": false,
        "canRetry": true,
        "consecutiveFailures": 0,
        "retryCount": 0,
        "maxRetries": 3
      }
    }
  }
}
```

### Error Responses

When rate limits are exceeded and retries exhausted:

```json
{
  "error": {
    "message": "Model claude-3-5-sonnet is rate limited. Max retries exceeded. Please wait 15 seconds before trying again.",
    "type": "api_error"
  }
}
```

## Usage Examples

### Normal Operation

1. User makes request to rate-limited model
2. Request succeeds normally
3. RateLimitManager tracks success

### Rate Limit Scenario

1. User makes request to rate-limited model
2. SAP AI Core returns 429 error
3. RateLimitManager logs rate limit start
4. DirectApiHandler waits calculated delay
5. Retry attempt is made
6. If successful, recovery is logged
7. If failed, process repeats until max retries

### Monitoring

```bash
# Check rate limit status
curl -s http://localhost:3001/health | jq '.rateLimit'

# Monitor logs for rate limit events
tail -f logs/app.log | grep "RATE LIMIT"
```

## Technical Details

### Retry Delay Calculation

```typescript
// Exponential backoff with jitter
const exponentialDelay = baseDelayMs * Math.pow(exponentialBase, retryCount);
const jitter = exponentialDelay * jitterFactor * Math.random();
const totalDelay = Math.min(exponentialDelay + jitter, maxDelayMs);
```

### State Transitions

```
NORMAL → (429 error) → RATE_LIMITED
RATE_LIMITED → (retry attempt) → RECOVERING
RECOVERING → (success) → NORMAL
RECOVERING → (429 error) → RATE_LIMITED
```

### Error Detection

Rate limit errors are identified by:
- HTTP status code 429
- Error message containing "TooManyRequest"
- Error message containing "rate limit"

## Testing

Comprehensive test suite in `tests/unit/sap-aicore-rate-limit-tests.ts`:

```bash
# Run rate limit tests
npm test -- --grep "rate limit"

# Run specific test file
npm test tests/unit/sap-aicore-rate-limit-tests.ts
```

Test coverage includes:
- State management
- Retry logic
- Exponential backoff
- Recovery detection
- Multi-model isolation
- Configuration loading

## Best Practices

### For Users

1. **Monitor Health Endpoint**: Check `/health` for rate limit status
2. **Configure Appropriately**: Adjust settings based on usage patterns
3. **Handle Errors Gracefully**: Implement fallback logic for rate limit errors
4. **Use Multiple Models**: Distribute load across different models

### For Administrators

1. **Monitor Logs**: Watch for rate limit patterns
2. **Adjust Configuration**: Tune retry settings based on observed behavior
3. **Set Alerts**: Monitor rate limit frequency and duration
4. **Capacity Planning**: Consider rate limits in usage planning

## Troubleshooting

### Common Issues

#### High Rate Limit Frequency
```bash
# Check current settings
curl -s http://localhost:3001/health | jq '.rateLimit.config'

# Increase retry delay
export RATE_LIMIT_BASE_DELAY_MS=2000
export RATE_LIMIT_MAX_DELAY_MS=60000
```

#### Models Stuck in Rate Limited State
```bash
# Check model status
curl -s http://localhost:3001/health | jq '.rateLimit.modelStatus'

# Manual reset via API (if implemented)
# Or restart the service
```

#### Excessive Retry Attempts
```bash
# Reduce max retries
export RATE_LIMIT_MAX_RETRIES=2

# Increase exponential base for faster backoff
export RATE_LIMIT_EXPONENTIAL_BASE=3
```

### Log Analysis

```bash
# Find rate limit episodes
grep "RATE LIMIT.*started" logs/app.log

# Calculate average rate limit duration
grep "RATE LIMIT.*ended" logs/app.log | grep -o "duration: [^)]*"

# Count retries per model
grep "RATE LIMIT.*Retrying" logs/app.log | cut -d"'" -f2 | sort | uniq -c
```

## Future Enhancements

### Planned Features

1. **Request Queuing**: Queue requests during rate limit periods
2. **Load Balancing**: Distribute requests across multiple deployments
3. **Predictive Throttling**: Proactively slow requests before hitting limits
4. **Circuit Breaker**: Temporarily disable models with persistent issues
5. **Metrics Dashboard**: Web interface for rate limit monitoring

### Configuration Improvements

1. **Per-Model Settings**: Different retry settings per model
2. **Time-Based Configuration**: Different settings based on time of day
3. **Dynamic Adjustment**: Auto-tune based on observed patterns
4. **Priority Queuing**: Priority levels for different request types

## Conclusion

This comprehensive rate limiting solution provides robust handling of SAP AI Core rate limits with minimal user impact. The combination of intelligent retry logic, clear logging, and comprehensive monitoring ensures reliable operation even under rate limiting conditions.

The solution is production-ready and includes extensive testing, configuration options, and monitoring capabilities. It gracefully handles the transition from rate limiting to recovery, providing users with a seamless experience while respecting SAP AI Core's rate limiting policies.
