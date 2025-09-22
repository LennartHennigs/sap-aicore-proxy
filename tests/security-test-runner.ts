#!/usr/bin/env node

/**
 * Comprehensive Security Test Runner
 * Runs all security hardening tests and provides consolidated results
 */

import { SecureLoggerTests } from './unit/secure-logger-tests.js';
import { ValidationMiddlewareTests } from './unit/validation-middleware-tests.js';
import { RateLimitingTests } from './unit/rate-limiting-tests.js';
import { SecurityHeadersTests } from './unit/security-headers-tests.js';
import { SecurityIntegrationTests } from './integration/security-integration-tests.js';

class SecurityTestRunner {
  async runAllSecurityTests(): Promise<void> {
    console.log('🔒 SAP AI Core Proxy - Security Hardening Test Suite');
    console.log('====================================================\n');
    
    const startTime = Date.now();
    
    try {
      // Unit Tests
      console.log('📋 Running Unit Tests...\n');
      
      const secureLoggerTests = new SecureLoggerTests();
      await secureLoggerTests.runAllTests();
      
      const validationTests = new ValidationMiddlewareTests();
      await validationTests.runAllTests();
      
      const rateLimitTests = new RateLimitingTests();
      await rateLimitTests.runAllTests();
      
      const headersTests = new SecurityHeadersTests();
      await headersTests.runAllTests();
      
      // Integration Tests
      console.log('🔗 Running Integration Tests...\n');
      
      const integrationTests = new SecurityIntegrationTests();
      await integrationTests.runAllTests();
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      console.log('✅ Security Test Suite Completed Successfully!');
      console.log(`⏱️  Total execution time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)\n`);
      
      // Summary of security implementations tested
      console.log('🛡️  Security Implementations Verified:');
      console.log('   ✅ Secure logging with information disclosure prevention');
      console.log('   ✅ Input validation and sanitization middleware');
      console.log('   ✅ Rate limiting and DoS protection');
      console.log('   ✅ Security headers (CSP, HSTS, X-Frame-Options, etc.)');
      console.log('   ✅ Cross-layer security integration');
      console.log('   ✅ Malicious input handling');
      console.log('   ✅ Error message sanitization');
      console.log('   ✅ Performance under security constraints\n');
      
      console.log('🚀 Your SAP AI Core Proxy is now security hardened!');
      
    } catch (error) {
      console.error('\n❌ Security test suite failed:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new SecurityTestRunner();
  runner.runAllSecurityTests().catch((error) => {
    console.error('Fatal error in security test runner:', error);
    process.exit(1);
  });
}

export { SecurityTestRunner };