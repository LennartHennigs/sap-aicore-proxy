/**
 * Unit tests for SAP AI Core rate limit handling
 * Tests the RateLimitManager and DirectApiHandler retry logic
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { rateLimitManager, RateLimitState } from '../../src/utils/rate-limit-manager.js';

interface TestResult {
  success: boolean;
  error?: string;
  data?: any;
}

export class SapAiCoreRateLimitTests {
  private testModelName = 'test-model-rate-limit';

  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Running SAP AI Core Rate Limit Tests...\n');

    const tests = [
      { name: 'Rate limit manager initializes correctly', test: () => this.testRateLimitManagerInitialization() },
      { name: 'Model starts in NORMAL state', test: () => this.testInitialModelState() },
      { name: 'Rate limit detection works correctly', test: () => this.testRateLimitDetection() },
      { name: 'Exponential backoff calculation', test: () => this.testExponentialBackoff() },
      { name: 'Retry-After header parsing', test: () => this.testRetryAfterParsing() },
      { name: 'State transitions work correctly', test: () => this.testStateTransitions() },
      { name: 'Max retries enforcement', test: () => this.testMaxRetriesEnforcement() },
      { name: 'Recovery detection', test: () => this.testRecoveryDetection() },
      { name: 'Multiple model isolation', test: () => this.testMultipleModelIsolation() },
      { name: 'Configuration loading', test: () => this.testConfigurationLoading() },
      { name: 'Rate limit status reporting', test: () => this.testRateLimitStatusReporting() },
      { name: 'State reset functionality', test: () => this.testStateReset() }
    ];

    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        console.log(`Running: ${test.name}`);
        const result = await test.test();
        results.push(result);
        
        if (result.success) {
          console.log(`✅ ${test.name}`);
        } else {
          console.log(`❌ ${test.name}: ${result.error}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          success: false,
          error: `Test threw exception: ${errorMessage}`
        });
        console.log(`❌ ${test.name}: ${errorMessage}`);
      }
    }

    return results;
  }

  // Test 1: Rate limit manager initialization
  async testRateLimitManagerInitialization(): Promise<TestResult> {
    try {
      const config = rateLimitManager.getConfig();
      
      // Check that configuration has expected properties
      const requiredProps = ['maxRetries', 'baseDelayMs', 'maxDelayMs', 'exponentialBase', 'jitterFactor'];
      for (const prop of requiredProps) {
        if (!(prop in config)) {
          return {
            success: false,
            error: `Missing configuration property: ${prop}`
          };
        }
      }

      // Check reasonable default values
      if (config.maxRetries < 1 || config.maxRetries > 10) {
        return {
          success: false,
          error: `Invalid maxRetries value: ${config.maxRetries}`
        };
      }

      if (config.baseDelayMs < 100 || config.baseDelayMs > 10000) {
        return {
          success: false,
          error: `Invalid baseDelayMs value: ${config.baseDelayMs}`
        };
      }

      return {
        success: true,
        data: { config }
      };
    } catch (error) {
      return {
        success: false,
        error: `Initialization test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Test 2: Initial model state
  async testInitialModelState(): Promise<TestResult> {
    const modelName = `${this.testModelName}-initial`;
    
    // Reset any existing state
    rateLimitManager.resetModelState(modelName);
    
    const status = rateLimitManager.getModelRateLimitStatus(modelName);
    
    if (status.state !== RateLimitState.NORMAL) {
      return {
        success: false,
        error: `Expected NORMAL state, got ${status.state}`
      };
    }

    if (status.isRateLimited !== false) {
      return {
        success: false,
        error: `Expected isRateLimited to be false, got ${status.isRateLimited}`
      };
    }

    if (status.canRetry !== true) {
      return {
        success: false,
        error: `Expected canRetry to be true, got ${status.canRetry}`
      };
    }

    return {
      success: true,
      data: { status }
    };
  }

  // Test 3: Rate limit detection
  async testRateLimitDetection(): Promise<TestResult> {
    const modelName = `${this.testModelName}-detection`;
    
    // Reset state
    rateLimitManager.resetModelState(modelName);
    
    // Initially should not be rate limited
    if (rateLimitManager.isRateLimited(modelName)) {
      return {
        success: false,
        error: 'Model should not be rate limited initially'
      };
    }

    // Simulate a rate limit response
    rateLimitManager.handleRateLimit(modelName, {});
    
    // Should still be able to retry after first 429
    if (rateLimitManager.isRateLimited(modelName)) {
      return {
        success: false,
        error: 'Model should not be rate limited after first 429 (retries available)'
      };
    }

    // Exhaust all retries
    const config = rateLimitManager.getConfig();
    for (let i = 1; i < config.maxRetries; i++) {
      rateLimitManager.handleRateLimit(modelName, {});
    }

    // Now should be rate limited
    if (!rateLimitManager.isRateLimited(modelName)) {
      return {
        success: false,
        error: 'Model should be rate limited after exhausting retries'
      };
    }

    return {
      success: true,
      data: { maxRetries: config.maxRetries }
    };
  }

  // Test 4: Exponential backoff calculation
  async testExponentialBackoff(): Promise<TestResult> {
    const modelName = `${this.testModelName}-backoff`;
    
    // Reset state
    rateLimitManager.resetModelState(modelName);
    
    const delays: number[] = [];
    const config = rateLimitManager.getConfig();
    
    // Collect delays from multiple rate limit events
    for (let i = 0; i < 3; i++) {
      rateLimitManager.handleRateLimit(modelName, {});
      const status = rateLimitManager.getModelRateLimitStatus(modelName);
      
      if (status.nextRetryTime) {
        const nextRetry = new Date(status.nextRetryTime);
        const delay = nextRetry.getTime() - Date.now();
        delays.push(delay);
      }
    }

    if (delays.length < 2) {
      return {
        success: false,
        error: 'Not enough delay measurements collected'
      };
    }

    // Check that delays are generally increasing (exponential backoff)
    let increasing = true;
    for (let i = 1; i < delays.length; i++) {
      // Allow some tolerance for jitter
      if (delays[i] < delays[i-1] * 0.8) {
        increasing = false;
        break;
      }
    }

    if (!increasing) {
      return {
        success: false,
        error: `Delays not increasing as expected: ${delays}`
      };
    }

    return {
      success: true,
      data: { delays, config }
    };
  }

  // Test 5: Retry-After header parsing
  async testRetryAfterParsing(): Promise<TestResult> {
    const modelName = `${this.testModelName}-retry-after`;
    
    // Reset state
    rateLimitManager.resetModelState(modelName);
    
    // Test with numeric Retry-After header
    rateLimitManager.handleRateLimit(modelName, { 'retry-after': '30' });
    
    const status = rateLimitManager.getModelRateLimitStatus(modelName);
    
    if (!status.nextRetryTime) {
      return {
        success: false,
        error: 'Next retry time not set'
      };
    }

    const nextRetry = new Date(status.nextRetryTime);
    const expectedDelay = nextRetry.getTime() - Date.now();
    
    // Should be approximately 30 seconds (allowing for some processing time)
    if (expectedDelay < 25000 || expectedDelay > 35000) {
      return {
        success: false,
        error: `Expected ~30 second delay, got ${expectedDelay}ms`
      };
    }

    return {
      success: true,
      data: { expectedDelay }
    };
  }

  // Test 6: State transitions
  async testStateTransitions(): Promise<TestResult> {
    const modelName = `${this.testModelName}-transitions`;
    
    // Reset state
    rateLimitManager.resetModelState(modelName);
    
    // Start in NORMAL state
    let status = rateLimitManager.getModelRateLimitStatus(modelName);
    if (status.state !== RateLimitState.NORMAL) {
      return {
        success: false,
        error: `Expected NORMAL state, got ${status.state}`
      };
    }

    // Trigger rate limit -> should go to RATE_LIMITED
    rateLimitManager.handleRateLimit(modelName, {});
    status = rateLimitManager.getModelRateLimitStatus(modelName);
    if (status.state !== RateLimitState.RATE_LIMITED) {
      return {
        success: false,
        error: `Expected RATE_LIMITED state, got ${status.state}`
      };
    }

    // Mark as recovering -> should go to RECOVERING
    rateLimitManager.markRecovering(modelName);
    status = rateLimitManager.getModelRateLimitStatus(modelName);
    if (status.state !== RateLimitState.RECOVERING) {
      return {
        success: false,
        error: `Expected RECOVERING state, got ${status.state}`
      };
    }

    // Handle success -> should go back to NORMAL
    rateLimitManager.handleSuccess(modelName);
    status = rateLimitManager.getModelRateLimitStatus(modelName);
    if (status.state !== RateLimitState.NORMAL) {
      return {
        success: false,
        error: `Expected NORMAL state after success, got ${status.state}`
      };
    }

    return {
      success: true,
      data: { finalState: status.state }
    };
  }

  // Test 7: Max retries enforcement
  async testMaxRetriesEnforcement(): Promise<TestResult> {
    const modelName = `${this.testModelName}-max-retries`;
    
    // Reset state
    rateLimitManager.resetModelState(modelName);
    
    const config = rateLimitManager.getConfig();
    
    // Should be able to retry initially
    if (!rateLimitManager.canRetry(modelName)) {
      return {
        success: false,
        error: 'Should be able to retry initially'
      };
    }

    // Hit rate limit multiple times
    for (let i = 0; i < config.maxRetries + 1; i++) {
      rateLimitManager.handleRateLimit(modelName, {});
    }

    // Should no longer be able to retry
    if (rateLimitManager.canRetry(modelName)) {
      return {
        success: false,
        error: 'Should not be able to retry after max retries exceeded'
      };
    }

    // Should be rate limited
    if (!rateLimitManager.isRateLimited(modelName)) {
      return {
        success: false,
        error: 'Should be rate limited after max retries exceeded'
      };
    }

    const status = rateLimitManager.getModelRateLimitStatus(modelName);
    if (status.retryCount <= config.maxRetries) {
      return {
        success: false,
        error: `Retry count ${status.retryCount} should exceed max retries ${config.maxRetries}`
      };
    }

    return {
      success: true,
      data: { retryCount: status.retryCount, maxRetries: config.maxRetries }
    };
  }

  // Test 8: Recovery detection
  async testRecoveryDetection(): Promise<TestResult> {
    const modelName = `${this.testModelName}-recovery`;
    
    // Reset state
    rateLimitManager.resetModelState(modelName);
    
    // Put model in rate limited state
    rateLimitManager.handleRateLimit(modelName, {});
    rateLimitManager.handleRateLimit(modelName, {});
    
    const beforeRecovery = rateLimitManager.getModelRateLimitStatus(modelName);
    if (beforeRecovery.state === RateLimitState.NORMAL) {
      return {
        success: false,
        error: 'Model should not be in NORMAL state before recovery'
      };
    }

    // Handle successful response
    rateLimitManager.handleSuccess(modelName);
    
    const afterRecovery = rateLimitManager.getModelRateLimitStatus(modelName);
    if (afterRecovery.state !== RateLimitState.NORMAL) {
      return {
        success: false,
        error: `Expected NORMAL state after recovery, got ${afterRecovery.state}`
      };
    }

    if (afterRecovery.retryCount !== 0) {
      return {
        success: false,
        error: `Expected retry count to be reset to 0, got ${afterRecovery.retryCount}`
      };
    }

    if (afterRecovery.consecutiveFailures !== 0) {
      return {
        success: false,
        error: `Expected consecutive failures to be reset to 0, got ${afterRecovery.consecutiveFailures}`
      };
    }

    return {
      success: true,
      data: { beforeRecovery, afterRecovery }
    };
  }

  // Test 9: Multiple model isolation
  async testMultipleModelIsolation(): Promise<TestResult> {
    const model1 = `${this.testModelName}-isolation-1`;
    const model2 = `${this.testModelName}-isolation-2`;
    
    // Reset both models
    rateLimitManager.resetModelState(model1);
    rateLimitManager.resetModelState(model2);
    
    // Rate limit only model1
    rateLimitManager.handleRateLimit(model1, {});
    rateLimitManager.handleRateLimit(model1, {});
    rateLimitManager.handleRateLimit(model1, {});
    rateLimitManager.handleRateLimit(model1, {});
    
    const status1 = rateLimitManager.getModelRateLimitStatus(model1);
    const status2 = rateLimitManager.getModelRateLimitStatus(model2);
    
    // Model1 should be rate limited
    if (status1.state === RateLimitState.NORMAL) {
      return {
        success: false,
        error: 'Model1 should not be in NORMAL state'
      };
    }

    // Model2 should still be normal
    if (status2.state !== RateLimitState.NORMAL) {
      return {
        success: false,
        error: `Model2 should be in NORMAL state, got ${status2.state}`
      };
    }

    if (rateLimitManager.isRateLimited(model2)) {
      return {
        success: false,
        error: 'Model2 should not be rate limited'
      };
    }

    return {
      success: true,
      data: { model1Status: status1, model2Status: status2 }
    };
  }

  // Test 10: Configuration loading
  async testConfigurationLoading(): Promise<TestResult> {
    const config = rateLimitManager.getConfig();
    
    // Check that all configuration values are reasonable
    const checks = [
      { name: 'maxRetries', value: config.maxRetries, min: 1, max: 20 },
      { name: 'baseDelayMs', value: config.baseDelayMs, min: 100, max: 60000 },
      { name: 'maxDelayMs', value: config.maxDelayMs, min: 1000, max: 300000 },
      { name: 'exponentialBase', value: config.exponentialBase, min: 1.1, max: 10 },
      { name: 'jitterFactor', value: config.jitterFactor, min: 0, max: 1 }
    ];

    for (const check of checks) {
      if (check.value < check.min || check.value > check.max) {
        return {
          success: false,
          error: `${check.name} value ${check.value} is outside expected range [${check.min}, ${check.max}]`
        };
      }
    }

    return {
      success: true,
      data: { config }
    };
  }

  // Test 11: Rate limit status reporting
  async testRateLimitStatusReporting(): Promise<TestResult> {
    const model1 = `${this.testModelName}-status-1`;
    const model2 = `${this.testModelName}-status-2`;
    
    // Reset models
    rateLimitManager.resetModelState(model1);
    rateLimitManager.resetModelState(model2);
    
    // Put model1 in different state
    rateLimitManager.handleRateLimit(model1, {});
    
    const allStatus = rateLimitManager.getRateLimitStatus();
    
    // Should contain both models
    if (!(model1 in allStatus)) {
      return {
        success: false,
        error: `Status should contain ${model1}`
      };
    }

    if (!(model2 in allStatus)) {
      return {
        success: false,
        error: `Status should contain ${model2}`
      };
    }

    // Check that status contains expected fields
    const requiredFields = ['state', 'isRateLimited', 'canRetry', 'consecutiveFailures', 'retryCount', 'maxRetries'];
    for (const field of requiredFields) {
      if (!(field in allStatus[model1])) {
        return {
          success: false,
          error: `Status should contain field ${field}`
        };
      }
    }

    return {
      success: true,
      data: { allStatus }
    };
  }

  // Test 12: State reset functionality
  async testStateReset(): Promise<TestResult> {
    const modelName = `${this.testModelName}-reset`;
    
    // Put model in rate limited state
    rateLimitManager.handleRateLimit(modelName, {});
    rateLimitManager.handleRateLimit(modelName, {});
    
    const beforeReset = rateLimitManager.getModelRateLimitStatus(modelName);
    if (beforeReset.state === RateLimitState.NORMAL) {
      return {
        success: false,
        error: 'Model should not be in NORMAL state before reset'
      };
    }

    // Reset the model
    rateLimitManager.resetModelState(modelName);
    
    const afterReset = rateLimitManager.getModelRateLimitStatus(modelName);
    if (afterReset.state !== RateLimitState.NORMAL) {
      return {
        success: false,
        error: `Expected NORMAL state after reset, got ${afterReset.state}`
      };
    }

    if (afterReset.retryCount !== 0) {
      return {
        success: false,
        error: `Expected retry count to be 0 after reset, got ${afterReset.retryCount}`
      };
    }

    if (afterReset.consecutiveFailures !== 0) {
      return {
        success: false,
        error: `Expected consecutive failures to be 0 after reset, got ${afterReset.consecutiveFailures}`
      };
    }

    return {
      success: true,
      data: { beforeReset, afterReset }
    };
  }

  // Cleanup helper
  private cleanup(): void {
    // Reset any test models
    const testModels = [
      `${this.testModelName}-initial`,
      `${this.testModelName}-detection`,
      `${this.testModelName}-backoff`,
      `${this.testModelName}-retry-after`,
      `${this.testModelName}-transitions`,
      `${this.testModelName}-max-retries`,
      `${this.testModelName}-recovery`,
      `${this.testModelName}-isolation-1`,
      `${this.testModelName}-isolation-2`,
      `${this.testModelName}-status-1`,
      `${this.testModelName}-status-2`,
      `${this.testModelName}-reset`
    ];

    testModels.forEach(model => {
      try {
        rateLimitManager.resetModelState(model);
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  }
}

// Export for use in test runner
export default SapAiCoreRateLimitTests;
