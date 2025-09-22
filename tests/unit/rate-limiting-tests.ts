#!/usr/bin/env node

/**
 * Unit tests for rate limiting functionality
 * Tests both general and AI endpoint rate limits, DoS protection
 */

import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { SecureLogger } from '../../src/utils/secure-logger.js';

interface TestResult {
  success: boolean;
  error?: string;
  data?: any;
}

class RateLimitingTests {
  private app: express.Application;
  private originalEnv: { [key: string]: string | undefined } = {};
  private rateLimitLogs: string[] = [];

  constructor() {
    this.setupTestApp();
    this.saveEnvironment();
    this.mockSecureLogger();
  }

  private setupTestApp(): void {
    this.app = express();
    this.app.use(express.json());

    // General rate limiter with very low limits for testing
    const generalLimiter = rateLimit({
      windowMs: 60000, // 1 minute for testing
      max: 3, // Very low limit for testing
      message: {
        error: {
          message: 'Too many requests, please try again later',
          type: 'rate_limit_error'
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        SecureLogger.logRateLimitHit(req.ip, req.path);
        res.status(429).json({
          error: {
            message: 'Too many requests, please try again later',
            type: 'rate_limit_error'
          }
        });
      }
    });

    // AI-specific rate limiter with even lower limits
    const aiLimiter = rateLimit({
      windowMs: 30000, // 30 seconds for testing
      max: 2, // Very low limit for testing
      message: {
        error: {
          message: 'AI request rate limit exceeded, please try again later',
          type: 'ai_rate_limit_error'
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        SecureLogger.logRateLimitHit(req.ip, req.path);
        res.status(429).json({
          error: {
            message: 'AI request rate limit exceeded, please try again later',
            type: 'ai_rate_limit_error'
          }
        });
      }
    });

    // Apply general rate limiting to all routes
    this.app.use(generalLimiter);

    // Test endpoints
    this.app.get('/test/general', (req, res) => {
      res.json({ success: true, message: 'General endpoint accessed' });
    });

    this.app.post('/v1/chat/completions', aiLimiter, (req, res) => {
      res.json({ 
        success: true, 
        message: 'AI endpoint accessed',
        choices: [{ message: { content: 'Test response' } }]
      });
    });

    this.app.get('/test/ai', aiLimiter, (req, res) => {
      res.json({ success: true, message: 'AI test endpoint accessed' });
    });
  }

  private saveEnvironment(): void {
    this.originalEnv = {
      RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
      AI_RATE_LIMIT_WINDOW_MS: process.env.AI_RATE_LIMIT_WINDOW_MS,
      AI_RATE_LIMIT_MAX_REQUESTS: process.env.AI_RATE_LIMIT_MAX_REQUESTS
    };
  }

  private restoreEnvironment(): void {
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }

  private mockSecureLogger(): void {
    // Mock the logRateLimitHit method to capture calls
    const originalLogRateLimitHit = SecureLogger.logRateLimitHit;
    SecureLogger.logRateLimitHit = (ip: string, path: string) => {
      this.rateLimitLogs.push(`Rate limit hit from ${ip} on ${path}`);
      originalLogRateLimitHit.call(SecureLogger, ip, path);
    };
  }

  private clearRateLimitLogs(): void {
    this.rateLimitLogs = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Test 1: General rate limit allows normal usage
  async testGeneralRateLimitNormalUsage(): Promise<TestResult> {
    try {
      this.clearRateLimitLogs();

      // Should allow first 3 requests within limit
      for (let i = 1; i <= 3; i++) {
        const response = await request(this.app)
          .get('/test/general')
          .expect(200);

        if (!response.body.success) {
          return {
            success: false,
            error: `Request ${i} was rejected when it should have been allowed`
          };
        }
      }

      return { 
        success: true, 
        data: { message: 'All 3 requests within limit were allowed' } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 2: General rate limit blocks excessive requests
  async testGeneralRateLimitBlocking(): Promise<TestResult> {
    try {
      this.clearRateLimitLogs();

      // First 3 requests should succeed
      for (let i = 1; i <= 3; i++) {
        await request(this.app)
          .get('/test/general')
          .expect(200);
      }

      // 4th request should be rate limited
      const response = await request(this.app)
        .get('/test/general')
        .expect(429);

      if (response.body.error.type !== 'rate_limit_error') {
        return {
          success: false,
          error: 'Rate limit error type incorrect'
        };
      }

      // Check that rate limit was logged
      if (this.rateLimitLogs.length === 0) {
        return {
          success: false,
          error: 'Rate limit hit was not logged'
        };
      }

      return { 
        success: true, 
        data: { 
          error: response.body.error,
          logs: this.rateLimitLogs.length
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 3: AI rate limit is more restrictive
  async testAIRateLimitMoreRestrictive(): Promise<TestResult> {
    try {
      this.clearRateLimitLogs();

      // Should allow first 2 AI requests
      for (let i = 1; i <= 2; i++) {
        const response = await request(this.app)
          .get('/test/ai')
          .expect(200);

        if (!response.body.success) {
          return {
            success: false,
            error: `AI request ${i} was rejected when it should have been allowed`
          };
        }
      }

      // 3rd AI request should be rate limited
      const response = await request(this.app)
        .get('/test/ai')
        .expect(429);

      if (response.body.error.type !== 'ai_rate_limit_error') {
        return {
          success: false,
          error: 'AI rate limit error type incorrect'
        };
      }

      return { 
        success: true, 
        data: { 
          error: response.body.error,
          message: 'AI rate limit is more restrictive (2 vs 3 requests)'
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 4: Chat completions endpoint has AI rate limiting
  async testChatCompletionsRateLimit(): Promise<TestResult> {
    try {
      this.clearRateLimitLogs();

      // Should allow first 2 chat completion requests
      for (let i = 1; i <= 2; i++) {
        const response = await request(this.app)
          .post('/v1/chat/completions')
          .send({
            model: 'test-model',
            messages: [{ role: 'user', content: `Test message ${i}` }]
          })
          .expect(200);

        if (!response.body.success) {
          return {
            success: false,
            error: `Chat completion request ${i} was rejected`
          };
        }
      }

      // 3rd request should be rate limited
      const response = await request(this.app)
        .post('/v1/chat/completions')
        .send({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Test message 3' }]
        })
        .expect(429);

      if (response.body.error.type !== 'ai_rate_limit_error') {
        return {
          success: false,
          error: 'Chat completions AI rate limit error type incorrect'
        };
      }

      return { 
        success: true, 
        data: { 
          error: response.body.error,
          logs: this.rateLimitLogs.length
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 5: Rate limit headers are present
  async testRateLimitHeaders(): Promise<TestResult> {
    try {
      const response = await request(this.app)
        .get('/test/general')
        .expect(200);

      // Check for standard rate limit headers
      const rateLimitHeaders = [
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'x-ratelimit-reset'
      ];

      const missingHeaders = rateLimitHeaders.filter(header => !response.headers[header]);
      
      if (missingHeaders.length > 0) {
        return {
          success: false,
          error: `Missing rate limit headers: ${missingHeaders.join(', ')}`
        };
      }

      // Check header values make sense
      const limit = parseInt(response.headers['x-ratelimit-limit']);
      const remaining = parseInt(response.headers['x-ratelimit-remaining']);

      if (limit !== 3) {
        return {
          success: false,
          error: `Expected limit 3, got ${limit}`
        };
      }

      if (remaining < 0 || remaining >= limit) {
        return {
          success: false,
          error: `Invalid remaining count: ${remaining} (limit: ${limit})`
        };
      }

      return { 
        success: true, 
        data: { 
          headers: {
            limit: response.headers['x-ratelimit-limit'],
            remaining: response.headers['x-ratelimit-remaining'],
            reset: response.headers['x-ratelimit-reset']
          }
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 6: Rate limit window reset functionality
  async testRateLimitWindowReset(): Promise<TestResult> {
    try {
      this.clearRateLimitLogs();

      // Create a test app with very short window for this test
      const testApp = express();
      testApp.use(express.json());

      const shortLimiter = rateLimit({
        windowMs: 1000, // 1 second window
        max: 1, // 1 request per second
        standardHeaders: true,
        handler: (req, res) => {
          res.status(429).json({ error: { type: 'rate_limit_error' } });
        }
      });

      testApp.use(shortLimiter);
      testApp.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // First request should succeed
      await request(testApp)
        .get('/test')
        .expect(200);

      // Second immediate request should be rate limited
      await request(testApp)
        .get('/test')
        .expect(429);

      // Wait for window to reset
      await this.sleep(1100); // Wait slightly longer than window

      // Request after reset should succeed again
      const response = await request(testApp)
        .get('/test')
        .expect(200);

      if (!response.body.success) {
        return {
          success: false,
          error: 'Request after window reset was rejected'
        };
      }

      return { 
        success: true, 
        data: { message: 'Rate limit window reset functionality works' } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 7: Multiple IP addresses have separate limits
  async testSeparateIPLimits(): Promise<TestResult> {
    try {
      this.clearRateLimitLogs();

      // Create requests from different IPs using X-Forwarded-For
      const ip1Requests = [];
      const ip2Requests = [];

      // IP1 uses up its limit
      for (let i = 1; i <= 3; i++) {
        ip1Requests.push(
          request(this.app)
            .get('/test/general')
            .set('X-Forwarded-For', '192.168.1.1')
            .expect(200)
        );
      }

      await Promise.all(ip1Requests);

      // IP1 should now be rate limited
      await request(this.app)
        .get('/test/general')
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(429);

      // But IP2 should still work
      const ip2Response = await request(this.app)
        .get('/test/general')
        .set('X-Forwarded-For', '192.168.1.2')
        .expect(200);

      if (!ip2Response.body.success) {
        return {
          success: false,
          error: 'IP2 was rate limited when it should have been allowed'
        };
      }

      return { 
        success: true, 
        data: { message: 'Different IP addresses have separate rate limits' } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 8: DoS protection stress test
  async testDoSProtectionStressTest(): Promise<TestResult> {
    try {
      this.clearRateLimitLogs();

      // Simulate a DoS attack with many rapid requests
      const rapidRequests = [];
      const numRequests = 10;

      for (let i = 1; i <= numRequests; i++) {
        rapidRequests.push(
          request(this.app)
            .get('/test/general')
            .set('X-Forwarded-For', '192.168.1.100') // Attacking IP
        );
      }

      const results = await Promise.allSettled(rapidRequests);
      
      // Count successful vs rate-limited responses
      let successCount = 0;
      let rateLimitedCount = 0;

      results.forEach(result => {
        if (result.status === 'fulfilled') {
          if (result.value.status === 200) {
            successCount++;
          } else if (result.value.status === 429) {
            rateLimitedCount++;
          }
        }
      });

      // Should allow only the first 3 requests
      if (successCount !== 3) {
        return {
          success: false,
          error: `Expected 3 successful requests, got ${successCount}`
        };
      }

      if (rateLimitedCount !== 7) {
        return {
          success: false,
          error: `Expected 7 rate-limited requests, got ${rateLimitedCount}`
        };
      }

      // Check that multiple rate limit hits were logged
      if (this.rateLimitLogs.length < 5) {
        return {
          success: false,
          error: `Expected multiple rate limit logs, got ${this.rateLimitLogs.length}`
        };
      }

      return { 
        success: true, 
        data: { 
          successCount,
          rateLimitedCount,
          logsCount: this.rateLimitLogs.length,
          message: 'DoS protection successfully blocked excess requests'
        } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runAllTests(): Promise<void> {
    console.log('\n🔒 Running Rate Limiting Tests...\n');

    const tests = [
      { name: 'General rate limit allows normal usage', test: () => this.testGeneralRateLimitNormalUsage() },
      { name: 'General rate limit blocks excessive requests', test: () => this.testGeneralRateLimitBlocking() },
      { name: 'AI rate limit is more restrictive', test: () => this.testAIRateLimitMoreRestrictive() },
      { name: 'Chat completions endpoint has AI rate limiting', test: () => this.testChatCompletionsRateLimit() },
      { name: 'Rate limit headers are present', test: () => this.testRateLimitHeaders() },
      { name: 'Rate limit window reset functionality', test: () => this.testRateLimitWindowReset() },
      { name: 'Multiple IP addresses have separate limits', test: () => this.testSeparateIPLimits() },
      { name: 'DoS protection stress test', test: () => this.testDoSProtectionStressTest() }
    ];

    let passed = 0;
    let failed = 0;

    for (const { name, test } of tests) {
      try {
        const result = await test();
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${name}`);
        
        if (!result.success) {
          console.log(`   Error: ${result.error}`);
          failed++;
        } else {
          passed++;
          if (result.data) {
            console.log(`   Data: ${JSON.stringify(result.data, null, 2).slice(0, 300)}${JSON.stringify(result.data).length > 300 ? '...' : ''}`);
          }
        }

        // Small delay between tests to avoid interference
        await this.sleep(100);
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    // Restore environment
    this.restoreEnvironment();

    console.log(`\n📊 Rate Limiting Test Results: ${passed} passed, ${failed} failed\n`);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new RateLimitingTests();
  tests.runAllTests().catch(console.error);
}

export { RateLimitingTests };