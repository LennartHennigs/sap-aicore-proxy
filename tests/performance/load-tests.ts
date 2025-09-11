#!/usr/bin/env node

/**
 * Performance and load tests for SAP AI Core proxy
 * Tests response times, concurrent requests, and system performance under load
 */

import { ProxyHttpClient, PerformanceMonitor, TestUtils, type TestResult } from '../utils/test-helpers.js';
import { TEST_MESSAGES, MODEL_CAPABILITIES, TEST_CONFIG } from '../utils/test-data.js';

export interface PerformanceTestResults {
  responseTime: Record<string, TestResult>;
  concurrentRequests: Record<string, TestResult>;
  memoryUsage: TestResult;
  throughput: Record<string, TestResult>;
  streamingPerformance: Record<string, TestResult>;
  overallSuccess: boolean;
}

export class PerformanceTests {
  private client: ProxyHttpClient;
  private monitor: PerformanceMonitor;

  constructor() {
    this.client = new ProxyHttpClient();
    this.monitor = new PerformanceMonitor();
  }

  async runAllTests(): Promise<PerformanceTestResults> {
    console.log('⚡ Running Performance Tests...\n');

    const results: PerformanceTestResults = {
      responseTime: {},
      concurrentRequests: {},
      memoryUsage: { success: false },
      throughput: {},
      streamingPerformance: {},
      overallSuccess: false
    };

    const models = Object.keys(MODEL_CAPABILITIES);

    try {
      // Test 1: Response time benchmarks
      console.log('⏱️ Testing response times...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.responseTime[model] = await this.testResponseTime(model);
        TestUtils.logTestResult(`${model} Response Time`, results.responseTime[model]);
      }

      // Test 2: Concurrent requests
      console.log('\n🔄 Testing concurrent requests...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.concurrentRequests[model] = await this.testConcurrentRequests(model);
        TestUtils.logTestResult(`${model} Concurrent Requests`, results.concurrentRequests[model]);
      }

      // Test 3: Memory usage monitoring
      console.log('\n💾 Testing memory usage...');
      results.memoryUsage = await this.testMemoryUsage();
      TestUtils.logTestResult('Memory Usage', results.memoryUsage);

      // Test 4: Throughput testing
      console.log('\n📊 Testing throughput...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.throughput[model] = await this.testThroughput(model);
        TestUtils.logTestResult(`${model} Throughput`, results.throughput[model]);
      }

      // Test 5: Streaming performance (for supported models)
      console.log('\n🌊 Testing streaming performance...');
      const streamingModels = models.filter(model => 
        MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES].supportsStreaming
      );

      for (const model of streamingModels) {
        console.log(`   Testing ${model}...`);
        results.streamingPerformance[model] = await this.testStreamingPerformance(model);
        TestUtils.logTestResult(`${model} Streaming Performance`, results.streamingPerformance[model]);
      }

      // Calculate overall success
      const allResults = [
        ...Object.values(results.responseTime),
        ...Object.values(results.concurrentRequests),
        results.memoryUsage,
        ...Object.values(results.throughput),
        ...Object.values(results.streamingPerformance)
      ];

      const successfulTests = allResults.filter(r => r.success).length;
      results.overallSuccess = successfulTests > allResults.length * 0.7; // 70% success rate

      console.log(`\n🎯 Performance Tests ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      console.log(`   Success Rate: ${successfulTests}/${allResults.length} (${Math.round(successfulTests/allResults.length*100)}%)`);
      
      // Performance summary
      const performanceValidation = this.monitor.validatePerformance();
      TestUtils.logValidationResult('Performance Thresholds', performanceValidation);
      
      return results;

    } catch (error) {
      console.error('💥 Performance tests failed with error:', error);
      return results;
    }
  }

  private async testResponseTime(model: string): Promise<TestResult> {
    try {
      const iterations = 5;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await TestUtils.retry(
          () => this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 50 })
        );

        if (!result.success) {
          return {
            success: false,
            error: `Response time test failed on iteration ${i + 1}: ${result.error}`,
            responseTime: result.responseTime
          };
        }

        if (result.responseTime) {
          responseTimes.push(result.responseTime);
          this.monitor.recordMetric(result.responseTime);
        }
      }

      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const minResponseTime = Math.min(...responseTimes);
      const maxResponseTime = Math.max(...responseTimes);

      // Check against performance thresholds
      const exceedsThreshold = maxResponseTime > TEST_CONFIG.PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS;

      return {
        success: !exceedsThreshold,
        error: exceedsThreshold ? `Max response time ${maxResponseTime}ms exceeds threshold ${TEST_CONFIG.PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS}ms` : undefined,
        data: {
          iterations,
          avgResponseTime: Math.round(avgResponseTime),
          minResponseTime,
          maxResponseTime,
          responseTimes,
          withinThreshold: !exceedsThreshold
        },
        responseTime: avgResponseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testConcurrentRequests(model: string): Promise<TestResult> {
    try {
      const concurrentCount = TEST_CONFIG.PERFORMANCE_THRESHOLDS.CONCURRENT_REQUESTS;
      const startTime = Date.now();

      // Create concurrent requests
      const requests = Array(concurrentCount).fill(null).map(() =>
        this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 30 })
      );

      const results = await Promise.allSettled(requests);
      const totalTime = Date.now() - startTime;

      // Analyze results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
      const errors = results.filter(r => r.status === 'rejected').length;

      const successRate = successful / concurrentCount;
      const avgTimePerRequest = totalTime / concurrentCount;

      // Record metrics for successful requests
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success && result.value.responseTime) {
          this.monitor.recordMetric(result.value.responseTime);
        }
      });

      return {
        success: successRate >= 0.8, // 80% success rate for concurrent requests
        error: successRate < 0.8 ? `Low success rate: ${Math.round(successRate * 100)}%` : undefined,
        data: {
          concurrentCount,
          successful,
          failed,
          errors,
          successRate: Math.round(successRate * 100),
          totalTime,
          avgTimePerRequest: Math.round(avgTimePerRequest),
          handledConcurrency: true
        },
        responseTime: totalTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testMemoryUsage(): Promise<TestResult> {
    try {
      // Get initial memory usage
      const initialMemory = process.memoryUsage();
      
      // Perform some operations to test memory stability
      const operations = 10;
      for (let i = 0; i < operations; i++) {
        await this.client.chatCompletion('gpt-5-nano', TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 20 });
        await TestUtils.sleep(100); // Small delay between requests
      }

      // Get final memory usage
      const finalMemory = process.memoryUsage();
      
      // Calculate memory changes
      const memoryDelta = {
        rss: finalMemory.rss - initialMemory.rss,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        external: finalMemory.external - initialMemory.external
      };

      // Check if memory usage is reasonable
      const memoryThreshold = TEST_CONFIG.PERFORMANCE_THRESHOLDS.MEMORY_USAGE_MB * 1024 * 1024; // Convert to bytes
      const exceedsThreshold = finalMemory.heapUsed > memoryThreshold;

      return {
        success: !exceedsThreshold,
        error: exceedsThreshold ? `Memory usage ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB exceeds threshold ${TEST_CONFIG.PERFORMANCE_THRESHOLDS.MEMORY_USAGE_MB}MB` : undefined,
        data: {
          initialMemory: {
            rss: Math.round(initialMemory.rss / 1024 / 1024),
            heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(initialMemory.heapTotal / 1024 / 1024)
          },
          finalMemory: {
            rss: Math.round(finalMemory.rss / 1024 / 1024),
            heapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(finalMemory.heapTotal / 1024 / 1024)
          },
          memoryDelta: {
            rss: Math.round(memoryDelta.rss / 1024 / 1024),
            heapUsed: Math.round(memoryDelta.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryDelta.heapTotal / 1024 / 1024)
          },
          operations,
          withinThreshold: !exceedsThreshold
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testThroughput(model: string): Promise<TestResult> {
    try {
      const duration = 30000; // 30 seconds
      const startTime = Date.now();
      let requestCount = 0;
      let successCount = 0;
      let errorCount = 0;

      console.log(`     Running throughput test for ${duration/1000} seconds...`);

      // Run requests continuously for the duration
      while (Date.now() - startTime < duration) {
        try {
          const result = await this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 20 });
          requestCount++;
          
          if (result.success) {
            successCount++;
            if (result.responseTime) {
              this.monitor.recordMetric(result.responseTime);
            }
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }

        // Small delay to prevent overwhelming the system
        await TestUtils.sleep(100);
      }

      const actualDuration = Date.now() - startTime;
      const requestsPerSecond = (requestCount / actualDuration) * 1000;
      const successRate = successCount / requestCount;

      return {
        success: successRate >= 0.7, // 70% success rate for throughput
        error: successRate < 0.7 ? `Low throughput success rate: ${Math.round(successRate * 100)}%` : undefined,
        data: {
          duration: actualDuration,
          totalRequests: requestCount,
          successfulRequests: successCount,
          errorCount,
          requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
          successRate: Math.round(successRate * 100),
          throughputMeasured: true
        },
        responseTime: actualDuration
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testStreamingPerformance(model: string): Promise<TestResult> {
    try {
      const iterations = 3;
      const streamingMetrics: any[] = [];

      for (let i = 0; i < iterations; i++) {
        const result = await TestUtils.retry(
          () => this.client.streamingChatCompletion(model, TEST_MESSAGES.GREETING, { max_tokens: 100 })
        );

        if (!result.success) {
          return {
            success: false,
            error: `Streaming performance test failed on iteration ${i + 1}: ${result.error}`,
            responseTime: result.responseTime
          };
        }

        const streamData = result.data;
        streamingMetrics.push({
          responseTime: result.responseTime,
          contentLength: streamData.content?.length || 0,
          chunksReceived: streamData.chunks || 0,
          tokensPerSecond: result.responseTime ? (streamData.content?.length || 0) / (result.responseTime / 1000) : 0
        });

        if (result.responseTime) {
          this.monitor.recordMetric(result.responseTime);
        }
      }

      const avgResponseTime = streamingMetrics.reduce((sum, m) => sum + m.responseTime, 0) / iterations;
      const avgTokensPerSecond = streamingMetrics.reduce((sum, m) => sum + m.tokensPerSecond, 0) / iterations;
      const avgChunks = streamingMetrics.reduce((sum, m) => sum + m.chunksReceived, 0) / iterations;

      // Check streaming performance
      const streamingEfficient = avgTokensPerSecond > 10; // At least 10 tokens per second

      return {
        success: streamingEfficient,
        error: !streamingEfficient ? `Low streaming performance: ${Math.round(avgTokensPerSecond)} tokens/sec` : undefined,
        data: {
          iterations,
          avgResponseTime: Math.round(avgResponseTime),
          avgTokensPerSecond: Math.round(avgTokensPerSecond),
          avgChunks: Math.round(avgChunks),
          streamingMetrics,
          streamingEfficient
        },
        responseTime: avgResponseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  getPerformanceSummary() {
    return {
      averageResponseTime: this.monitor.getAverageResponseTime(),
      maxResponseTime: this.monitor.getMaxResponseTime(),
      minResponseTime: this.monitor.getMinResponseTime(),
      totalMetrics: this.monitor.getMetrics().length,
      performanceValidation: this.monitor.validatePerformance()
    };
  }
}

// Main execution function
export async function runPerformanceTests(): Promise<PerformanceTestResults> {
  const performanceTests = new PerformanceTests();
  const results = await performanceTests.runAllTests();
  
  // Log performance summary
  console.log('\n📈 Performance Summary:');
  const summary = performanceTests.getPerformanceSummary();
  console.log(`   Average Response Time: ${TestUtils.formatDuration(summary.averageResponseTime)}`);
  console.log(`   Min Response Time: ${TestUtils.formatDuration(summary.minResponseTime)}`);
  console.log(`   Max Response Time: ${TestUtils.formatDuration(summary.maxResponseTime)}`);
  console.log(`   Total Requests Measured: ${summary.totalMetrics}`);
  
  return results;
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPerformanceTests()
    .then(results => {
      console.log('\n📊 Performance Test Summary:');
      
      const categories = [
        { name: 'Response Time', results: results.responseTime },
        { name: 'Concurrent Requests', results: results.concurrentRequests },
        { name: 'Throughput', results: results.throughput },
        { name: 'Streaming Performance', results: results.streamingPerformance }
      ];

      categories.forEach(category => {
        const categoryResults = Object.entries(category.results);
        if (categoryResults.length === 0) {
          return;
        }
        
        const successful = categoryResults.filter(([, result]) => result.success).length;
        const total = categoryResults.length;
        
        console.log(`   ${category.name}: ${successful}/${total} successful`);
        categoryResults.forEach(([model, result]) => {
          console.log(`     ${model}: ${result.success ? '✅' : '❌'}`);
        });
      });
      
      console.log(`   Memory Usage: ${results.memoryUsage.success ? '✅' : '❌'}`);
      
      console.log(`\n🎯 Overall: ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Performance tests failed:', error);
      process.exit(1);
    });
}

export default { PerformanceTests, runPerformanceTests };
