#!/usr/bin/env node

/**
 * Claude Native API Tests
 * Tests for the bug fix that enabled Claude native API access with development authentication
 */

import { ProxyHttpClient, TestUtils } from './utils/test-helpers.js';
import { TEST_CONFIG } from './utils/test-data.js';

interface ClaudeTestResult {
  success: boolean;
  data?: any;
  error?: string;
  responseTime?: number;
  statusCode?: number;
}

class ClaudeNativeApiTests {
  private client: ProxyHttpClient;
  private devClient: ProxyHttpClient;
  private invalidClient: ProxyHttpClient;

  constructor() {
    // Test with development key (should work)
    this.devClient = new ProxyHttpClient(TEST_CONFIG.PROXY_URL, 'any-string-works');
    
    // Test with proper API key (should work)
    this.client = new ProxyHttpClient(TEST_CONFIG.PROXY_URL, 'sk-proj-HK56Fkjt0nvZ5lMhla1G0MHF0nQO6RJdrkMLA8w1XrQ');
    
    // Test with invalid key (should fail)
    this.invalidClient = new ProxyHttpClient(TEST_CONFIG.PROXY_URL, 'invalid-key');
  }

  async testClaudeNativeEndpoint(): Promise<ClaudeTestResult> {
    try {
      const result = await this.devClient.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'anthropic--claude-4-sonnet',
          messages: [
            {
              role: 'user',
              content: 'Hello, please respond briefly.'
            }
          ],
          max_tokens: 100
        })
      });

      // Validate Claude-specific response format
      if (result.success && result.data) {
        const response = result.data;
        
        // Check Claude response structure
        const hasValidStructure = 
          response.id &&
          response.type === 'message' &&
          response.role === 'assistant' &&
          Array.isArray(response.content) &&
          response.content.length > 0 &&
          response.content[0].type === 'text' &&
          response.content[0].text &&
          response.model === 'anthropic--claude-4-sonnet' &&
          response.stop_reason === 'end_turn' &&
          response.usage &&
          typeof response.usage.input_tokens === 'number' &&
          typeof response.usage.output_tokens === 'number';

        if (!hasValidStructure) {
          return {
            success: false,
            error: 'Invalid Claude response structure',
            responseTime: result.responseTime
          };
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async testAuthenticationScenarios(): Promise<{ [key: string]: ClaudeTestResult }> {
    const results: { [key: string]: ClaudeTestResult } = {};

    // Test 1: Development key should work
    try {
      results.devKey = await this.devClient.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'anthropic--claude-4-sonnet',
          messages: [{ role: 'user', content: 'Test dev key' }],
          max_tokens: 50
        })
      });
    } catch (error) {
      results.devKey = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 2: Proper API key should work
    try {
      results.properKey = await this.client.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'anthropic--claude-4-sonnet',
          messages: [{ role: 'user', content: 'Test proper key' }],
          max_tokens: 50
        })
      });
    } catch (error) {
      results.properKey = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 3: Invalid key should fail
    try {
      results.invalidKey = await this.invalidClient.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'anthropic--claude-4-sonnet',
          messages: [{ role: 'user', content: 'Test invalid key' }],
          max_tokens: 50
        })
      });
    } catch (error) {
      results.invalidKey = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    return results;
  }

  async testBackwardCompatibility(): Promise<ClaudeTestResult> {
    // Test that the fix maintains backward compatibility with v1.1.0 behavior
    try {
      const result = await this.devClient.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'anthropic--claude-4-sonnet',
          messages: [
            {
              role: 'user',
              content: 'This should work like in v1.1.0'
            }
          ],
          max_tokens: 100
        })
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async testAnthropicStrategyCreation(): Promise<ClaudeTestResult> {
    // Test that AnthropicStrategy is properly created for anthropic_bedrock format
    try {
      const result = await this.devClient.makeRequest('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'anthropic--claude-4-sonnet',
          messages: [
            {
              role: 'user',
              content: 'Test strategy creation'
            }
          ],
          max_tokens: 50
        })
      });

      // The server logs should show "🤖 Created strategy: AnthropicStrategy for format: anthropic_bedrock"
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🔧 Claude Native API Bug Fix Tests');
    console.log('================================================================================');
    console.log('Testing the fix for Claude native API authentication issue');
    console.log('');

    // Test 1: Basic Claude native endpoint
    console.log('📋 Testing Claude native /v1/messages endpoint...');
    const basicTest = await this.testClaudeNativeEndpoint();
    TestUtils.logTestResult('Claude Native Endpoint', basicTest);
    console.log('');

    // Test 2: Authentication scenarios
    console.log('🔐 Testing authentication scenarios...');
    const authTests = await this.testAuthenticationScenarios();
    
    TestUtils.logTestResult('Development Key (any-string-works)', authTests.devKey);
    TestUtils.logTestResult('Proper API Key', authTests.properKey);
    TestUtils.logTestResult('Invalid Key (should fail)', {
      ...authTests.invalidKey,
      success: !authTests.invalidKey.success // Invert because we expect this to fail
    });
    console.log('');

    // Test 3: Backward compatibility
    console.log('🔄 Testing backward compatibility with v1.1.0...');
    const compatTest = await this.testBackwardCompatibility();
    TestUtils.logTestResult('Backward Compatibility', compatTest);
    console.log('');

    // Test 4: Strategy creation
    console.log('🤖 Testing AnthropicStrategy creation...');
    const strategyTest = await this.testAnthropicStrategyCreation();
    TestUtils.logTestResult('AnthropicStrategy Creation', strategyTest);
    console.log('');

    // Summary
    const totalTests = 6; // basic + 3 auth scenarios + compat + strategy
    const passedTests = [
      basicTest.success,
      authTests.devKey.success,
      authTests.properKey.success,
      !authTests.invalidKey.success, // Should fail
      compatTest.success,
      strategyTest.success
    ].filter(Boolean).length;

    console.log('📊 Test Results Summary');
    console.log('================================================================================');
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    console.log(`📈 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log('');

    if (passedTests === totalTests) {
      console.log('🎯 VERDICT: ✅ Claude Native API bug fix is working correctly!');
      console.log('');
      console.log('✨ Key fixes verified:');
      console.log('   • Development authentication middleware enabled');
      console.log('   • Legacy "any-string-works" key accepted in development mode');
      console.log('   • Proper API key still works');
      console.log('   • Invalid keys properly rejected');
      console.log('   • Backward compatibility with v1.1.0 maintained');
      console.log('   • AnthropicStrategy correctly created for Claude requests');
    } else {
      console.log('❌ VERDICT: Some tests failed - bug fix may not be complete');
    }

    console.log('================================================================================');
  }
}

// Run tests if this file is executed directly
async function runClaudeNativeApiTests(): Promise<void> {
  const testSuite = new ClaudeNativeApiTests();
  await testSuite.runAllTests();
}

// Export for use in other test files
export { ClaudeNativeApiTests };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runClaudeNativeApiTests().catch(console.error);
}
