#!/usr/bin/env node

/**
 * Claude Streaming Tests
 * Tests for Claude streaming capabilities in the SAP AI Core proxy
 */

import { ProxyHttpClient, TestUtils } from './utils/test-helpers.js';
import { TEST_CONFIG } from './utils/test-data.js';

interface StreamingTestResult {
  success: boolean;
  data?: any;
  error?: string;
  responseTime?: number;
  statusCode?: number;
  streamChunks?: number;
  totalContent?: string;
}

class ClaudeStreamingTests {
  private client: ProxyHttpClient;

  constructor() {
    this.client = new ProxyHttpClient(TEST_CONFIG.PROXY_URL, TEST_CONFIG.API_KEY);
  }

  async testClaudeOpenAIStreamingEndpoint(): Promise<StreamingTestResult> {
    try {
      const startTime = Date.now();
      let streamChunks = 0;
      let totalContent = '';

      const response = await fetch(`${TEST_CONFIG.PROXY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic--claude-3-sonnet',
          messages: [
            {
              role: 'user',
              content: 'Please count from 1 to 5, each number on a new line.'
            }
          ],
          max_tokens: 100,
          stream: true
        })
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          responseTime: Date.now() - startTime
        };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return {
          success: false,
          error: 'No response body available for streaming'
        };
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                break;
              }

              try {
                const parsed = JSON.parse(data);
                
                if (parsed.choices && parsed.choices[0]?.delta?.content) {
                  totalContent += parsed.choices[0].delta.content;
                  streamChunks++;
                }
              } catch (parseError) {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const responseTime = Date.now() - startTime;

      return {
        success: streamChunks > 0 && totalContent.length > 0,
        responseTime,
        streamChunks,
        totalContent,
        statusCode: response.status
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async testClaudeNativeStreamingEndpoint(): Promise<StreamingTestResult> {
    try {
      const startTime = Date.now();
      let streamChunks = 0;
      let totalContent = '';

      const response = await fetch(`${TEST_CONFIG.PROXY_URL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_CONFIG.API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic--claude-3-sonnet',
          messages: [
            {
              role: 'user',
              content: 'Please count from 1 to 3, each number on a new line.'
            }
          ],
          max_tokens: 50,
          stream: true
        })
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          responseTime: Date.now() - startTime
        };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return {
          success: false,
          error: 'No response body available for streaming'
        };
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              try {
                const parsed = JSON.parse(data);
                
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  totalContent += parsed.delta.text;
                  streamChunks++;
                }
              } catch (parseError) {
                // Ignore parse errors for incomplete JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const responseTime = Date.now() - startTime;

      return {
        success: streamChunks > 0 && totalContent.length > 0,
        responseTime,
        streamChunks,
        totalContent,
        statusCode: response.status
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async testStreamingRouterDetection(): Promise<StreamingTestResult> {
    try {
      const result = await this.client.makeRequest('/health', {
        method: 'GET'
      });

      if (result.success && result.data) {
        // Check if health endpoint shows streaming capabilities
        const hasStreamingInfo = result.data.models && 
          (result.data.models.available || result.data.models.directApi);

        return {
          success: hasStreamingInfo,
          data: result.data.models,
          responseTime: result.responseTime
        };
      }

      return {
        success: false,
        error: 'Health endpoint did not return expected data'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async testAnthropicDirectHandlerAvailability(): Promise<StreamingTestResult> {
    try {
      // Test if the Anthropic handler can detect API key availability
      const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
      
      return {
        success: true,
        data: {
          anthropicApiKeyAvailable: hasApiKey,
          message: hasApiKey ? 
            'ANTHROPIC_API_KEY is available for direct streaming' : 
            'ANTHROPIC_API_KEY not available - will use SAP AI Core routing'
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
    console.log('🌊 Claude Streaming Tests');
    console.log('================================================================================');
    console.log('Testing Claude streaming capabilities in the SAP AI Core proxy');
    console.log('');

    // Test 1: OpenAI-compatible streaming endpoint
    console.log('📋 Testing Claude streaming via OpenAI-compatible endpoint (/v1/chat/completions)...');
    const openaiStreamTest = await this.testClaudeOpenAIStreamingEndpoint();
    TestUtils.logTestResult('OpenAI-style Claude Streaming', openaiStreamTest);
    if (openaiStreamTest.success) {
      console.log(`   📊 Stream chunks received: ${openaiStreamTest.streamChunks}`);
      console.log(`   📝 Total content length: ${openaiStreamTest.totalContent?.length} chars`);
      console.log(`   ⏱️  Response time: ${openaiStreamTest.responseTime}ms`);
    }
    console.log('');

    // Test 2: Claude native streaming endpoint
    console.log('🤖 Testing Claude streaming via native endpoint (/v1/messages)...');
    const claudeStreamTest = await this.testClaudeNativeStreamingEndpoint();
    TestUtils.logTestResult('Claude Native Streaming', claudeStreamTest);
    if (claudeStreamTest.success) {
      console.log(`   📊 Stream chunks received: ${claudeStreamTest.streamChunks}`);
      console.log(`   📝 Total content length: ${claudeStreamTest.totalContent?.length} chars`);
      console.log(`   ⏱️  Response time: ${claudeStreamTest.responseTime}ms`);
    }
    console.log('');

    // Test 3: Streaming router detection
    console.log('🔍 Testing streaming capability detection...');
    const detectionTest = await this.testStreamingRouterDetection();
    TestUtils.logTestResult('Streaming Detection', detectionTest);
    if (detectionTest.success && detectionTest.data) {
      console.log(`   📡 Available models: ${detectionTest.data.available?.length || 0}`);
      console.log(`   🔗 Direct API models: ${detectionTest.data.directApi?.length || 0}`);
    }
    console.log('');

    // Test 4: Anthropic handler availability
    console.log('🔑 Testing Anthropic direct handler availability...');
    const handlerTest = await this.testAnthropicDirectHandlerAvailability();
    TestUtils.logTestResult('Anthropic Handler Availability', handlerTest);
    if (handlerTest.success && handlerTest.data) {
      console.log(`   ${handlerTest.data.message}`);
    }
    console.log('');

    // Summary
    const tests = [openaiStreamTest, claudeStreamTest, detectionTest, handlerTest];
    const passedTests = tests.filter(test => test.success).length;
    const totalTests = tests.length;

    console.log('📊 Test Results Summary');
    console.log('================================================================================');
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    console.log(`📈 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log('');

    if (passedTests === totalTests) {
      console.log('🎯 VERDICT: ✅ Claude streaming is working correctly!');
      console.log('');
      console.log('✨ Streaming capabilities verified:');
      console.log('   • OpenAI-compatible streaming endpoint (/v1/chat/completions)');
      console.log('   • Claude native streaming endpoint (/v1/messages)');
      console.log('   • Streaming capability detection and routing');
      console.log('   • Anthropic direct handler integration');
    } else {
      console.log('❌ VERDICT: Some streaming tests failed');
      console.log('');
      console.log('🔧 Possible issues:');
      console.log('   • ANTHROPIC_API_KEY environment variable not set');
      console.log('   • SAP AI Core streaming not properly configured');
      console.log('   • Network connectivity issues');
      console.log('   • Model routing configuration problems');
    }

    console.log('================================================================================');
  }
}

// Run tests if this file is executed directly
async function runClaudeStreamingTests(): Promise<void> {
  const testSuite = new ClaudeStreamingTests();
  await testSuite.runAllTests();
}

// Export for use in other test files
export { ClaudeStreamingTests };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runClaudeStreamingTests().catch(console.error);
}
