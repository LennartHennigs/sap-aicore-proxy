#!/usr/bin/env node

/**
 * SAP AI Core Rate Limit Test Runner
 * Runs comprehensive tests for the rate limiting implementation
 */

import { SapAiCoreRateLimitTests } from './unit/sap-aicore-rate-limit-tests.js';

class RateLimitTestRunner {
  async runRateLimitTests(): Promise<void> {
    console.log('🚦 SAP AI Core Rate Limiting Test Suite');
    console.log('==========================================\n');
    
    const startTime = Date.now();
    
    try {
      const rateLimitTests = new SapAiCoreRateLimitTests();
      const results = await rateLimitTests.runAllTests();
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Calculate test results
      const totalTests = results.length;
      const passedTests = results.filter(result => result.success).length;
      const failedTests = totalTests - passedTests;
      
      console.log('\n📊 Test Results Summary:');
      console.log('========================');
      console.log(`✅ Passed: ${passedTests}/${totalTests}`);
      console.log(`❌ Failed: ${failedTests}/${totalTests}`);
      console.log(`⏱️  Total time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)\n`);
      
      if (failedTests > 0) {
        console.log('❌ Failed Tests:');
        results
          .filter(result => !result.success)
          .forEach((result, index) => {
            console.log(`   ${index + 1}. ${result.error}`);
          });
        console.log('');
      }
      
      // Summary of rate limiting features tested
      console.log('🛡️  Rate Limiting Features Tested:');
      console.log('   ✅ State management and transitions');
      console.log('   ✅ Exponential backoff calculation');
      console.log('   ✅ Retry-After header parsing');
      console.log('   ✅ Recovery detection');
      console.log('   ✅ Multi-model isolation');
      console.log('   ✅ Max retries enforcement');
      console.log('   ✅ Configuration validation');
      console.log('   ✅ Status reporting and monitoring');
      console.log('   ✅ State reset functionality\n');
      
      if (failedTests === 0) {
        console.log('🎉 All rate limiting tests passed! The implementation is working correctly.');
      } else {
        console.log('⚠️  Some tests failed. Please review the implementation.');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('\n❌ Rate limit test suite failed:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new RateLimitTestRunner();
  runner.runRateLimitTests().catch((error) => {
    console.error('Fatal error in rate limit test runner:', error);
    process.exit(1);
  });
}

export { RateLimitTestRunner };
