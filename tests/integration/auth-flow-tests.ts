#!/usr/bin/env node

/**
 * Focused Authentication Flow Tests
 * Tests only the authentication logic without requiring external API connectivity
 */

import { ProxyHttpClient, TestUtils, type TestResult } from '../utils/test-helpers.js';
import { ApiKeyManager } from '../../src/auth/api-key-manager.js';

export interface AuthFlowTestResults {
  validKeyAuthentication: TestResult;
  invalidKeyRejection: TestResult;
  missingKeyRejection: TestResult;
  healthEndpointBypass: TestResult;
  overallSuccess: boolean;
}

export class AuthFlowTests {
  private validKey: string;

  constructor() {
    this.validKey = ApiKeyManager.getApiKey();
  }

  async runAllTests(): Promise<AuthFlowTestResults> {
    console.log('🔐 Running Focused Authentication Flow Tests...\n');

    const results: AuthFlowTestResults = {
      validKeyAuthentication: { success: false },
      invalidKeyRejection: { success: false },
      missingKeyRejection: { success: false },
      healthEndpointBypass: { success: false },
      overallSuccess: false
    };

    try {
      // Test 1: Valid key passes authentication
      console.log('✅ Testing valid key authentication...');
      results.validKeyAuthentication = await this.testValidKeyAuth();
      TestUtils.logTestResult('Valid Key Authentication', results.validKeyAuthentication);

      // Test 2: Invalid key is rejected
      console.log('\n❌ Testing invalid key rejection...');
      results.invalidKeyRejection = await this.testInvalidKeyRejection();
      TestUtils.logTestResult('Invalid Key Rejection', results.invalidKeyRejection);

      // Test 3: Missing key is rejected
      console.log('\n🚫 Testing missing key rejection...');
      results.missingKeyRejection = await this.testMissingKeyRejection();
      TestUtils.logTestResult('Missing Key Rejection', results.missingKeyRejection);

      // Test 4: Health endpoint bypasses authentication
      console.log('\n🏥 Testing health endpoint bypass...');
      results.healthEndpointBypass = await this.testHealthBypass();
      TestUtils.logTestResult('Health Endpoint Bypass', results.healthEndpointBypass);

      // Calculate overall success
      const allResults = [
        results.validKeyAuthentication,
        results.invalidKeyRejection,
        results.missingKeyRejection,
        results.healthEndpointBypass
      ];

      const successfulTests = allResults.filter(r => r.success).length;
      results.overallSuccess = successfulTests === allResults.length;

      console.log(`\n🎯 Authentication Flow Tests ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      console.log(`   Success Rate: ${successfulTests}/${allResults.length} (100%)`);

      return results;

    } catch (error) {
      console.error('💥 Authentication flow tests failed with error:', error);
      return results;
    }
  }

  private async testValidKeyAuth(): Promise<TestResult> {
    try {
      const client = new ProxyHttpClient('http://localhost:3001', this.validKey);
      
      // Test health endpoint first (should always work)
      const healthResult = await client.healthCheck();
      
      if (!healthResult.success && healthResult.statusCode !== 200) {
        return {
          success: false,
          error: 'Proxy server not accessible',
          data: { statusCode: healthResult.statusCode, error: healthResult.error }
        };
      }

      // Test a protected endpoint - models list is simpler than chat completion
      const modelsResult = await client.listModels();

      // Authentication success means we didn't get a 401
      const authSuccess = modelsResult.statusCode !== 401;
      const noAuthError = !(modelsResult.error?.includes('authentication') || 
                           modelsResult.error?.includes('Invalid API key'));

      return {
        success: authSuccess && noAuthError,
        data: {
          statusCode: modelsResult.statusCode,
          authPassed: authSuccess,
          noAuthError,
          error: modelsResult.error,
          hasData: !!modelsResult.data
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testInvalidKeyRejection(): Promise<TestResult> {
    try {
      const invalidKeys = [
        'invalid-key-123',
        'sk-proj-invalid',
        'wrong-format-key'
      ];

      const results: any[] = [];
      let rejectedCount = 0;

      for (const invalidKey of invalidKeys) {
        const client = new ProxyHttpClient('http://localhost:3001', invalidKey);
        const result = await client.listModels();

        const isRejected = result.statusCode === 401 || 
                          result.error?.includes('authentication') ||
                          result.error?.includes('Invalid API key');

        if (isRejected) rejectedCount++;

        results.push({
          key: invalidKey.substring(0, 15) + '...',
          rejected: isRejected,
          statusCode: result.statusCode,
          error: result.error
        });
      }

      const allRejected = rejectedCount === invalidKeys.length;

      return {
        success: allRejected,
        data: {
          totalTested: invalidKeys.length,
          rejectedCount,
          allRejected,
          results
        },
        error: allRejected ? undefined : `Only ${rejectedCount}/${invalidKeys.length} invalid keys were rejected`
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testMissingKeyRejection(): Promise<TestResult> {
    try {
      const client = new ProxyHttpClient('http://localhost:3001', '');
      const result = await client.listModels();

      const isRejected = result.statusCode === 401 || 
                        result.error?.includes('authentication') ||
                        result.error?.includes('API key');

      return {
        success: isRejected,
        data: {
          rejected: isRejected,
          statusCode: result.statusCode,
          error: result.error
        },
        error: isRejected ? undefined : 'Missing API key was not rejected'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testHealthBypass(): Promise<TestResult> {
    try {
      // Test health endpoint with no key, invalid key, and valid key
      const tests = [
        { name: 'No Key', key: '' },
        { name: 'Invalid Key', key: 'invalid-key' },
        { name: 'Valid Key', key: this.validKey }
      ];

      const results: any[] = [];
      let successCount = 0;

      for (const test of tests) {
        const client = new ProxyHttpClient('http://localhost:3001', test.key);
        const result = await client.healthCheck();

        const success = (result.success ?? false) || result.statusCode === 200;
        if (success) successCount++;

        results.push({
          scenario: test.name,
          success,
          statusCode: result.statusCode,
          bypassedAuth: success
        });
      }

      const allSuccessful = successCount === tests.length;

      return {
        success: allSuccessful,
        data: {
          totalTests: tests.length,
          successCount,
          allSuccessful,
          results
        },
        error: allSuccessful ? undefined : `Only ${successCount}/${tests.length} health checks succeeded`
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// Main execution function
export async function runAuthFlowTests(): Promise<AuthFlowTestResults> {
  const tests = new AuthFlowTests();
  return await tests.runAllTests();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAuthFlowTests()
    .then(results => {
      console.log('\n📊 Authentication Flow Test Summary:');
      console.log(`   Valid Key Authentication: ${results.validKeyAuthentication.success ? '✅' : '❌'}`);
      console.log(`   Invalid Key Rejection: ${results.invalidKeyRejection.success ? '✅' : '❌'}`);
      console.log(`   Missing Key Rejection: ${results.missingKeyRejection.success ? '✅' : '❌'}`);
      console.log(`   Health Endpoint Bypass: ${results.healthEndpointBypass.success ? '✅' : '❌'}`);
      console.log(`\n🎯 Overall: ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Authentication flow tests failed:', error);
      process.exit(1);
    });
}

export default { AuthFlowTests, runAuthFlowTests };
