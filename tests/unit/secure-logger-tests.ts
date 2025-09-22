#!/usr/bin/env node

/**
 * Unit tests for SecureLogger utility
 * Tests information disclosure prevention, sanitization, and secure logging
 */

import { SecureLogger } from '../../src/utils/secure-logger.js';

interface TestResult {
  success: boolean;
  error?: string;
  data?: any;
}

class SecureLoggerTests {
  private originalEnv: string | undefined;
  private logs: { level: string; message: string; data?: any }[] = [];
  private originalConsole: any = {};

  constructor() {
    this.originalEnv = process.env.NODE_ENV;
  }

  private mockConsole(): void {
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };

    console.log = (...args) => this.logs.push({ level: 'log', message: args.join(' ') });
    console.error = (...args) => this.logs.push({ level: 'error', message: args.join(' ') });
    console.warn = (...args) => this.logs.push({ level: 'warn', message: args.join(' ') });
    console.info = (...args) => this.logs.push({ level: 'info', message: args.join(' ') });
  }

  private restoreConsole(): void {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  }

  private clearLogs(): void {
    this.logs = [];
  }

  private findLogContaining(text: string): { level: string; message: string } | undefined {
    return this.logs.find(log => log.message.includes(text));
  }

  // Test 1: Error sanitization in production
  testErrorSanitizationProduction(): TestResult {
    try {
      process.env.NODE_ENV = 'production';
      this.clearLogs();
      this.mockConsole();

      const sensitiveError = new Error('Authentication failed: invalid client_id abc123 for deployment dep-456');
      const sanitized = (SecureLogger as any).sanitizeError(sensitiveError);

      this.restoreConsole();

      // Should not contain sensitive information
      if (sanitized.includes('abc123') || sanitized.includes('dep-456')) {
        return {
          success: false,
          error: 'Error sanitization failed: contains sensitive data'
        };
      }

      // Should be generic authentication message
      if (!sanitized.includes('Authentication failed') || sanitized.length > 50) {
        return {
          success: false,
          error: `Expected generic auth message, got: ${sanitized}`
        };
      }

      return { success: true, data: { sanitized } };
    } catch (error) {
      this.restoreConsole();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 2: Error sanitization in development
  testErrorSanitizationDevelopment(): TestResult {
    try {
      process.env.NODE_ENV = 'development';
      this.clearLogs();

      const detailedError = new Error('Connection failed to https://api.example.com with token bearer_xyz789');
      const sanitized = (SecureLogger as any).sanitizeError(detailedError);

      // In development, should preserve original message
      if (sanitized !== detailedError.message) {
        return {
          success: false,
          error: `Development mode should preserve original error: ${sanitized}`
        };
      }

      return { success: true, data: { sanitized } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 3: Token sanitization
  testTokenSanitization(): TestResult {
    try {
      this.clearLogs();

      const tokenString = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123';
      const sanitized = (SecureLogger as any).sanitizeForLogging(tokenString);

      // Should be masked
      if (!sanitized.includes('[REDACTED]')) {
        return {
          success: false,
          error: 'Token not properly redacted'
        };
      }

      // Should not contain actual token
      if (sanitized.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) {
        return {
          success: false,
          error: 'Token sanitization failed: still contains actual token'
        };
      }

      return { success: true, data: { sanitized } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 4: Authentication success logging (no sensitive data)
  testAuthSuccessLogging(): TestResult {
    try {
      this.clearLogs();
      this.mockConsole();

      SecureLogger.logAuthSuccess();

      const authLog = this.findLogContaining('Authentication successful');
      this.restoreConsole();

      if (!authLog) {
        return {
          success: false,
          error: 'Authentication success log not found'
        };
      }

      // Should not contain any credentials or tokens
      const sensitivePatterns = [
        'token', 'secret', 'key', 'password', 'bearer',
        'client_id', 'deployment', 'api_key'
      ];

      for (const pattern of sensitivePatterns) {
        if (authLog.message.toLowerCase().includes(pattern)) {
          return {
            success: false,
            error: `Auth success log contains sensitive pattern: ${pattern}`
          };
        }
      }

      return { success: true, data: { logMessage: authLog.message } };
    } catch (error) {
      this.restoreConsole();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 5: Security event logging
  testSecurityEventLogging(): TestResult {
    try {
      this.clearLogs();
      this.mockConsole();

      SecureLogger.logSecurityEvent('Rate limit exceeded', 'Multiple requests from 192.168.1.100');

      const securityLog = this.findLogContaining('SECURITY');
      this.restoreConsole();

      if (!securityLog) {
        return {
          success: false,
          error: 'Security event log not found'
        };
      }

      if (!securityLog.message.includes('Rate limit exceeded')) {
        return {
          success: false,
          error: 'Security event message missing'
        };
      }

      return { success: true, data: { logMessage: securityLog.message } };
    } catch (error) {
      this.restoreConsole();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 6: Model pool operation logging (no sensitive data)
  testModelPoolOperationLogging(): TestResult {
    try {
      this.clearLogs();
      this.mockConsole();

      SecureLogger.logModelPoolOperation('Creating new model instance', 'gpt-5-nano');

      const poolLog = this.findLogContaining('MODEL POOL');
      this.restoreConsole();

      if (!poolLog) {
        return {
          success: false,
          error: 'Model pool operation log not found'
        };
      }

      // Should contain model name but not deployment IDs or secrets
      if (!poolLog.message.includes('gpt-5-nano')) {
        return {
          success: false,
          error: 'Model name missing from log'
        };
      }

      // Should not contain deployment IDs or other sensitive info
      const sensitivePatterns = ['dep-', 'deployment-', 'secret', 'token', 'bearer'];
      for (const pattern of sensitivePatterns) {
        if (poolLog.message.toLowerCase().includes(pattern)) {
          return {
            success: false,
            error: `Model pool log contains sensitive pattern: ${pattern}`
          };
        }
      }

      return { success: true, data: { logMessage: poolLog.message } };
    } catch (error) {
      this.restoreConsole();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 7: Rate limit hit logging
  testRateLimitHitLogging(): TestResult {
    try {
      this.clearLogs();
      this.mockConsole();

      SecureLogger.logRateLimitHit('192.168.1.100', '/v1/chat/completions');

      const rateLimitLog = this.findLogContaining('RATE LIMIT');
      this.restoreConsole();

      if (!rateLimitLog) {
        return {
          success: false,
          error: 'Rate limit hit log not found'
        };
      }

      if (!rateLimitLog.message.includes('192.168.1.100') || !rateLimitLog.message.includes('/v1/chat/completions')) {
        return {
          success: false,
          error: 'Rate limit log missing IP or path'
        };
      }

      return { success: true, data: { logMessage: rateLimitLog.message } };
    } catch (error) {
      this.restoreConsole();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 8: Data sanitization for complex objects
  testComplexObjectSanitization(): TestResult {
    try {
      const complexObject = {
        user: 'test-user',
        authorization: 'Bearer secret-token-12345',
        data: {
          client_secret: 'very-secret-key',
          deployment_id: 'dep-abc123',
          safe_data: 'this is safe'
        },
        headers: {
          'x-api-key': 'api-key-xyz789',
          'content-type': 'application/json'
        }
      };

      const sanitized = (SecureLogger as any).sanitizeForLogging(complexObject);

      // Check that sensitive fields are redacted
      const sensitizedString = JSON.stringify(sanitized);

      if (sensitizedString.includes('secret-token-12345') || 
          sensitizedString.includes('very-secret-key') || 
          sensitizedString.includes('api-key-xyz789')) {
        return {
          success: false,
          error: 'Complex object sanitization failed: contains sensitive data'
        };
      }

      // Check that safe data is preserved
      if (!sensitizedString.includes('this is safe') || 
          !sensitizedString.includes('test-user') ||
          !sensitizedString.includes('application/json')) {
        return {
          success: false,
          error: 'Complex object sanitization removed safe data'
        };
      }

      // Check that redacted fields are marked
      if (!sensitizedString.includes('[REDACTED]')) {
        return {
          success: false,
          error: 'Complex object sanitization did not mark redacted fields'
        };
      }

      return { success: true, data: { sanitized } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runAllTests(): Promise<void> {
    console.log('\n🔒 Running SecureLogger Tests...\n');

    const tests = [
      { name: 'Error sanitization (production)', test: () => this.testErrorSanitizationProduction() },
      { name: 'Error sanitization (development)', test: () => this.testErrorSanitizationDevelopment() },
      { name: 'Token sanitization', test: () => this.testTokenSanitization() },
      { name: 'Authentication success logging', test: () => this.testAuthSuccessLogging() },
      { name: 'Security event logging', test: () => this.testSecurityEventLogging() },
      { name: 'Model pool operation logging', test: () => this.testModelPoolOperationLogging() },
      { name: 'Rate limit hit logging', test: () => this.testRateLimitHitLogging() },
      { name: 'Complex object sanitization', test: () => this.testComplexObjectSanitization() }
    ];

    let passed = 0;
    let failed = 0;

    for (const { name, test } of tests) {
      try {
        const result = test();
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${name}`);
        
        if (!result.success) {
          console.log(`   Error: ${result.error}`);
          failed++;
        } else {
          passed++;
          if (result.data) {
            console.log(`   Data: ${JSON.stringify(result.data)}`);
          }
        }
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    // Restore environment
    if (this.originalEnv !== undefined) {
      process.env.NODE_ENV = this.originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    console.log(`\n📊 SecureLogger Test Results: ${passed} passed, ${failed} failed\n`);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new SecureLoggerTests();
  tests.runAllTests().catch(console.error);
}

export { SecureLoggerTests };