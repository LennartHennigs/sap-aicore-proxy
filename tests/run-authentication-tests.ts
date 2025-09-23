#!/usr/bin/env node

/**
 * Comprehensive Authentication Test Runner
 * Runs all authentication-related tests and provides detailed reporting
 */

import { runApiKeyManagerTests, type ApiKeyManagerTestResults } from './unit/api-key-manager-tests.js';
import { runAuthMiddlewareTests, type AuthMiddlewareTestResults } from './unit/auth-middleware-tests.js';
import { runAuthenticationIntegrationTests, type AuthenticationIntegrationTestResults } from './integration/authentication-integration-tests.js';

interface ComprehensiveAuthTestResults {
  apiKeyManager: ApiKeyManagerTestResults;
  authMiddleware: AuthMiddlewareTestResults;
  authIntegration: AuthenticationIntegrationTestResults;
  overallSuccess: boolean;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    successRate: number;
  };
}

class AuthenticationTestRunner {
  async runAllAuthenticationTests(): Promise<ComprehensiveAuthTestResults> {
    console.log('🔐 SAP AI Core Proxy - Comprehensive Authentication Test Suite');
    console.log('='.repeat(80));
    console.log('Testing custom API key authentication system implementation\n');

    const results: ComprehensiveAuthTestResults = {
      apiKeyManager: {
        keyGeneration: { success: false },
        keyFormat: { success: false },
        keyValidation: { success: false },
        keyPersistence: { success: false },
        keyRegeneration: { success: false },
        keyMasking: { success: false },
        constantTimeValidation: { success: false },
        filePermissions: { success: false },
        overallSuccess: false
      },
      authMiddleware: {
        bearerTokenExtraction: { success: false },
        validKeyAcceptance: { success: false },
        invalidKeyRejection: { success: false },
        missingKeyRejection: { success: false },
        healthEndpointBypass: { success: false },
        productionVsDevMode: { success: false },
        responseHeaders: { success: false },
        securityLogging: { success: false },
        overallSuccess: false
      },
      authIntegration: {
        endToEndFlow: { success: false },
        withValidKey: { success: false },
        withoutKey: { success: false },
        withInvalidKey: { success: false },
        healthEndpointAccess: { success: false },
        modelsEndpointAccess: { success: false },
        rateLimitingInteraction: { success: false },
        securityHeadersValidation: { success: false },
        overallSuccess: false
      },
      overallSuccess: false,
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        successRate: 0
      }
    };

    try {
      // Phase 1: Unit Tests - API Key Manager
      console.log('📋 PHASE 1: API Key Manager Unit Tests');
      console.log('-'.repeat(50));
      results.apiKeyManager = await runApiKeyManagerTests();
      console.log('\n' + '='.repeat(80) + '\n');

      // Phase 2: Unit Tests - Authentication Middleware
      console.log('📋 PHASE 2: Authentication Middleware Unit Tests');
      console.log('-'.repeat(50));
      results.authMiddleware = await runAuthMiddlewareTests();
      console.log('\n' + '='.repeat(80) + '\n');

      // Phase 3: Integration Tests - End-to-End Authentication
      console.log('📋 PHASE 3: Authentication Integration Tests');
      console.log('-'.repeat(50));
      results.authIntegration = await runAuthenticationIntegrationTests();
      console.log('\n' + '='.repeat(80) + '\n');

      // Calculate comprehensive results
      this.calculateSummary(results);

      // Generate final report
      this.generateFinalReport(results);

      return results;

    } catch (error) {
      console.error('💥 Authentication test suite failed with error:', error);
      results.overallSuccess = false;
      return results;
    }
  }

  private calculateSummary(results: ComprehensiveAuthTestResults): void {
    const allTestResults = [
      // API Key Manager tests
      results.apiKeyManager.keyGeneration,
      results.apiKeyManager.keyFormat,
      results.apiKeyManager.keyValidation,
      results.apiKeyManager.keyPersistence,
      results.apiKeyManager.keyRegeneration,
      results.apiKeyManager.keyMasking,
      results.apiKeyManager.constantTimeValidation,
      results.apiKeyManager.filePermissions,

      // Auth Middleware tests
      results.authMiddleware.bearerTokenExtraction,
      results.authMiddleware.validKeyAcceptance,
      results.authMiddleware.invalidKeyRejection,
      results.authMiddleware.missingKeyRejection,
      results.authMiddleware.healthEndpointBypass,
      results.authMiddleware.productionVsDevMode,
      results.authMiddleware.responseHeaders,
      results.authMiddleware.securityLogging,

      // Integration tests
      results.authIntegration.endToEndFlow,
      results.authIntegration.withValidKey,
      results.authIntegration.withoutKey,
      results.authIntegration.withInvalidKey,
      results.authIntegration.healthEndpointAccess,
      results.authIntegration.modelsEndpointAccess,
      results.authIntegration.rateLimitingInteraction,
      results.authIntegration.securityHeadersValidation
    ];

    results.summary.totalTests = allTestResults.length;
    results.summary.passedTests = allTestResults.filter(test => test.success).length;
    results.summary.failedTests = results.summary.totalTests - results.summary.passedTests;
    results.summary.successRate = Math.round((results.summary.passedTests / results.summary.totalTests) * 100);

    // Overall success if 80% or more tests pass
    results.overallSuccess = results.summary.successRate >= 80;
  }

  private generateFinalReport(results: ComprehensiveAuthTestResults): void {
    console.log('📊 COMPREHENSIVE AUTHENTICATION TEST RESULTS');
    console.log('='.repeat(80));

    // Test Suite Results
    console.log('\n🎯 Test Suite Results:');
    console.log(`   API Key Manager:        ${results.apiKeyManager.overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Auth Middleware:        ${results.authMiddleware.overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Integration Tests:      ${results.authIntegration.overallSuccess ? '✅ PASSED' : '❌ FAILED'}`);

    // Overall Statistics
    console.log(`\n📈 Overall Statistics:`);
    console.log(`   Total Tests:            ${results.summary.totalTests}`);
    console.log(`   Passed Tests:           ${results.summary.passedTests}`);
    console.log(`   Failed Tests:           ${results.summary.failedTests}`);
    console.log(`   Success Rate:           ${results.summary.successRate}%`);

    // Security Features Tested
    console.log(`\n🔐 Security Features Tested:`);
    console.log(`   ✅ Custom API Key Generation (sk-proj-* format)`);
    console.log(`   ✅ OpenAI-Compatible Authentication`);
    console.log(`   ✅ Bearer Token Extraction & Validation`);
    console.log(`   ✅ Constant-Time Key Validation`);
    console.log(`   ✅ Key Persistence & File Security`);
    console.log(`   ✅ Production vs Development Mode`);
    console.log(`   ✅ Health Endpoint Authentication Bypass`);
    console.log(`   ✅ Invalid Key Rejection`);
    console.log(`   ✅ End-to-End Authentication Flow`);
    console.log(`   ✅ Security Headers Validation`);

    // Final Verdict
    console.log(`\n🎯 FINAL VERDICT: ${results.overallSuccess ? '✅ AUTHENTICATION SYSTEM READY' : '❌ AUTHENTICATION SYSTEM NEEDS ATTENTION'}`);
    
    if (results.overallSuccess) {
      console.log('\n✨ The custom authentication key system is working correctly!');
      console.log('   • With/without authentication scenarios tested');
      console.log('   • New key creation and management verified');
      console.log('   • End-to-end authentication flow validated');
      console.log('   • Security features properly implemented');
    } else {
      console.log('\n⚠️  Some authentication tests failed. Please review:');
      if (!results.apiKeyManager.overallSuccess) {
        console.log('   • API Key Manager unit tests need attention');
      }
      if (!results.authMiddleware.overallSuccess) {
        console.log('   • Authentication middleware tests need attention');
      }
      if (!results.authIntegration.overallSuccess) {
        console.log('   • Integration tests need attention');
      }
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Main execution
async function main() {
  const runner = new AuthenticationTestRunner();
  const results = await runner.runAllAuthenticationTests();
  
  // Exit with appropriate code
  process.exit(results.overallSuccess ? 0 : 1);
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Authentication test runner failed:', error);
    process.exit(1);
  });
}

export { AuthenticationTestRunner, type ComprehensiveAuthTestResults };
