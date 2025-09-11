#!/usr/bin/env node

/**
 * Connection tests for SAP AI Core proxy
 * Tests proxy startup, health checks, and model connectivity
 */

import { ProxyHttpClient, TestUtils, type TestResult } from '../utils/test-helpers.js';
import { TEST_CONFIG, MODEL_CAPABILITIES } from '../utils/test-data.js';

export interface ConnectionTestResults {
  proxyHealth: TestResult;
  modelsList: TestResult;
  modelConnections: Record<string, TestResult>;
  overallSuccess: boolean;
}

export class ConnectionTests {
  private client: ProxyHttpClient;

  constructor() {
    this.client = new ProxyHttpClient();
  }

  async runAllTests(): Promise<ConnectionTestResults> {
    console.log('🔌 Running Connection Tests...\n');

    const results: ConnectionTestResults = {
      proxyHealth: { success: false },
      modelsList: { success: false },
      modelConnections: {},
      overallSuccess: false
    };

    try {
      // Test 1: Proxy health check
      console.log('🏥 Testing proxy health...');
      results.proxyHealth = await this.testProxyHealth();
      TestUtils.logTestResult('Proxy Health Check', results.proxyHealth);

      // Test 2: Models list endpoint
      console.log('\n📋 Testing models list endpoint...');
      results.modelsList = await this.testModelsList();
      TestUtils.logTestResult('Models List Endpoint', results.modelsList);

      // Test 3: Individual model connections
      console.log('\n🤖 Testing individual model connections...');
      const models = Object.keys(MODEL_CAPABILITIES);
      
      for (const model of models) {
        console.log(`\n   Testing ${model}...`);
        results.modelConnections[model] = await this.testModelConnection(model);
        TestUtils.logTestResult(`${model} Connection`, results.modelConnections[model]);
      }

      // Determine overall success
      results.overallSuccess = results.proxyHealth.success && 
                              results.modelsList.success &&
                              Object.values(results.modelConnections).some(r => r.success);

      console.log(`\n🎯 Connection Tests ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      
      return results;

    } catch (error) {
      console.error('💥 Connection tests failed with error:', error);
      return results;
    }
  }

  private async testProxyHealth(): Promise<TestResult> {
    try {
      const result = await this.client.healthCheck();
      
      if (!result.success) {
        return result;
      }

      // Validate health response structure
      const healthData = result.data;
      if (!healthData || typeof healthData !== 'object') {
        return {
          success: false,
          error: 'Health endpoint returned invalid data structure',
          responseTime: result.responseTime
        };
      }

      // Check for expected health fields
      const expectedFields = ['status', 'timestamp', 'models'];
      const missingFields = expectedFields.filter(field => !(field in healthData));
      
      if (missingFields.length > 0) {
        return {
          success: false,
          error: `Health response missing fields: ${missingFields.join(', ')}`,
          responseTime: result.responseTime
        };
      }

      // Validate status
      if (healthData.status !== 'OK') {
        return {
          success: false,
          error: `Health status is not OK: ${healthData.status}`,
          responseTime: result.responseTime
        };
      }

      return {
        success: true,
        data: healthData,
        responseTime: result.responseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testModelsList(): Promise<TestResult> {
    try {
      const result = await this.client.listModels();
      
      if (!result.success) {
        return result;
      }

      // Validate models list response structure
      const modelsData = result.data;
      if (!modelsData || typeof modelsData !== 'object') {
        return {
          success: false,
          error: 'Models endpoint returned invalid data structure',
          responseTime: result.responseTime
        };
      }

      // Check for OpenAI-compatible structure
      if (!modelsData.object || modelsData.object !== 'list') {
        return {
          success: false,
          error: 'Models response missing or invalid object field',
          responseTime: result.responseTime
        };
      }

      if (!Array.isArray(modelsData.data)) {
        return {
          success: false,
          error: 'Models response data field is not an array',
          responseTime: result.responseTime
        };
      }

      // Check if we have expected models
      const availableModels = modelsData.data.map((model: any) => model.id);
      const expectedModels = Object.keys(MODEL_CAPABILITIES);
      const missingModels = expectedModels.filter(model => !availableModels.includes(model));

      if (missingModels.length > 0) {
        return {
          success: false,
          error: `Missing expected models: ${missingModels.join(', ')}`,
          responseTime: result.responseTime,
          data: { availableModels, expectedModels }
        };
      }

      return {
        success: true,
        data: { availableModels, totalModels: availableModels.length },
        responseTime: result.responseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testModelConnection(model: string): Promise<TestResult> {
    try {
      // Use a simple text message to test basic connectivity
      const testMessages = [
        {
          role: 'user' as const,
          content: 'Hello'
        }
      ];

      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, testMessages, { max_tokens: 10 }),
        2, // Reduced retries for connection test
        2000 // 2 second delay
      );

      if (!result.success) {
        return result;
      }

      // Basic validation that we got a response
      const response = result.data;
      if (!response || !response.choices || !Array.isArray(response.choices) || response.choices.length === 0) {
        return {
          success: false,
          error: 'Invalid response structure from model',
          responseTime: result.responseTime
        };
      }

      const message = response.choices[0]?.message;
      if (!message || !message.content) {
        return {
          success: false,
          error: 'No content in model response',
          responseTime: result.responseTime
        };
      }

      return {
        success: true,
        data: {
          model: response.model,
          contentLength: message.content.length,
          hasContent: message.content.trim().length > 0
        },
        responseTime: result.responseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async testProxyStartup(maxWaitTime = 30000): Promise<TestResult> {
    console.log('🚀 Testing proxy startup...');
    
    const startTime = Date.now();
    const checkInterval = 1000; // Check every second
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const result = await this.client.healthCheck();
        if (result.success) {
          return {
            success: true,
            data: { startupTime: Date.now() - startTime },
            responseTime: Date.now() - startTime
          };
        }
      } catch {
        // Ignore errors during startup
      }
      
      await TestUtils.sleep(checkInterval);
    }

    return {
      success: false,
      error: `Proxy did not start within ${maxWaitTime}ms`,
      responseTime: Date.now() - startTime
    };
  }

  async testProxyShutdown(): Promise<TestResult> {
    console.log('🛑 Testing proxy shutdown...');
    
    try {
      // First verify proxy is running
      const healthCheck = await this.client.healthCheck();
      if (!healthCheck.success) {
        return {
          success: false,
          error: 'Proxy is not running, cannot test shutdown'
        };
      }

      // Note: We can't actually shut down the proxy from tests
      // This would be tested manually or with process management
      return {
        success: true,
        data: { message: 'Shutdown test requires manual verification' }
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
export async function runConnectionTests(): Promise<ConnectionTestResults> {
  const connectionTests = new ConnectionTests();
  return await connectionTests.runAllTests();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runConnectionTests()
    .then(results => {
      console.log('\n📊 Connection Test Summary:');
      console.log(`   Proxy Health: ${results.proxyHealth.success ? '✅' : '❌'}`);
      console.log(`   Models List: ${results.modelsList.success ? '✅' : '❌'}`);
      
      const modelResults = Object.entries(results.modelConnections);
      const successfulModels = modelResults.filter(([, result]) => result.success).length;
      console.log(`   Model Connections: ${successfulModels}/${modelResults.length} successful`);
      
      modelResults.forEach(([model, result]) => {
        console.log(`     ${model}: ${result.success ? '✅' : '❌'}`);
      });
      
      console.log(`\n🎯 Overall: ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Connection tests failed:', error);
      process.exit(1);
    });
}

export default { ConnectionTests, runConnectionTests };
