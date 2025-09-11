import { TEST_CONFIG } from './utils/test-data';
import { TestResult, TestUtils } from './utils/test-helpers';
import { runConnectionTests, type ConnectionTestResults } from './unit/connection-tests';
import { runTextProcessingTests, type TextProcessingTestResults } from './unit/text-processing-tests';
import { runImageProcessingTests, type ImageProcessingTestResults } from './unit/image-processing-tests';
import { runResponseValidationTests, type ResponseValidationTestResults } from './unit/response-validation-tests';
import { runErrorHandlingTests, type ErrorHandlingTestResults } from './integration/error-handling-tests';
import { runPerformanceTests, type PerformanceTestResults } from './performance/load-tests';

// Extended TestResult interface for test suite
interface ExtendedTestResult extends TestResult {
  testName?: string;
  duration?: number;
  skipped?: boolean;
  details?: any;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface TestConfig {
  proxyUrl: string;
  apiKey: string;
  models: string[];
  testImages: {
    redPixel: string;
    bluePixel: string;
    yellowPixel: string;
    greenPixel: string;
  };
  performance: {
    maxResponseTime: number;
    concurrentRequests: number;
    throughputTestDuration: number;
    memoryThreshold: number;
  };
}

interface TestSuiteResult {
  suiteName: string;
  results: ExtendedTestResult[];
  summary: TestSummary;
  duration: number;
}

interface ComprehensiveTestReport {
  overallSummary: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    successRate: number;
    totalDuration: number;
  };
  suiteResults: TestSuiteResult[];
  failedTests: ExtendedTestResult[];
  performanceMetrics: {
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    throughputRpm: number;
  };
}

export class ProxyTestSuite {
  private config: TestConfig;

  constructor(config: TestConfig) {
    this.config = config;
  }

  async runAllTests(): Promise<ComprehensiveTestReport> {
    console.log('🚀 Starting SAP AI Core Proxy Test Suite');
    console.log('='.repeat(60));
    
    const startTime = Date.now();
    const suiteResults: TestSuiteResult[] = [];
    const allResults: ExtendedTestResult[] = [];

    // Run each test suite
    await this.runConnectionTestSuite(suiteResults, allResults);
    await this.runTextProcessingTestSuite(suiteResults, allResults);
    await this.runImageProcessingTestSuite(suiteResults, allResults);
    await this.runResponseValidationTestSuite(suiteResults, allResults);
    await this.runErrorHandlingTestSuite(suiteResults, allResults);
    await this.runPerformanceTestSuite(suiteResults, allResults);

    const totalDuration = Date.now() - startTime;
    
    // Generate comprehensive report
    const report = this.generateComprehensiveReport(suiteResults, allResults, totalDuration);
    
    // Print final report
    this.printFinalReport(report);
    
    return report;
  }

  private async runConnectionTestSuite(suiteResults: TestSuiteResult[], allResults: ExtendedTestResult[]): Promise<void> {
    console.log('\n📋 Running Connection Tests...');
    const suiteStartTime = Date.now();
    
    try {
      const results = await runConnectionTests();
      const testResults = this.convertConnectionResults(results);
      const suiteDuration = Date.now() - suiteStartTime;
      const summary = this.calculateSummary(testResults);
      
      suiteResults.push({
        suiteName: 'Connection Tests',
        results: testResults,
        summary,
        duration: suiteDuration
      });
      
      allResults.push(...testResults);
      console.log(`✅ Connection Tests completed: ${summary.passed}/${summary.total} passed (${(summary.passed/summary.total*100).toFixed(1)}%)`);
      
    } catch (error) {
      console.error('❌ Connection Tests failed to run:', error);
      this.addFailedSuiteResult('Connection Tests', error, suiteResults, allResults, Date.now() - suiteStartTime);
    }
  }

  private async runTextProcessingTestSuite(suiteResults: TestSuiteResult[], allResults: ExtendedTestResult[]): Promise<void> {
    console.log('\n📋 Running Text Processing Tests...');
    const suiteStartTime = Date.now();
    
    try {
      const results = await runTextProcessingTests();
      const testResults = this.convertTextProcessingResults(results);
      const suiteDuration = Date.now() - suiteStartTime;
      const summary = this.calculateSummary(testResults);
      
      suiteResults.push({
        suiteName: 'Text Processing Tests',
        results: testResults,
        summary,
        duration: suiteDuration
      });
      
      allResults.push(...testResults);
      console.log(`✅ Text Processing Tests completed: ${summary.passed}/${summary.total} passed (${(summary.passed/summary.total*100).toFixed(1)}%)`);
      
    } catch (error) {
      console.error('❌ Text Processing Tests failed to run:', error);
      this.addFailedSuiteResult('Text Processing Tests', error, suiteResults, allResults, Date.now() - suiteStartTime);
    }
  }

  private async runImageProcessingTestSuite(suiteResults: TestSuiteResult[], allResults: ExtendedTestResult[]): Promise<void> {
    console.log('\n📋 Running Image Processing Tests...');
    const suiteStartTime = Date.now();
    
    try {
      const results = await runImageProcessingTests();
      const testResults = this.convertImageProcessingResults(results);
      const suiteDuration = Date.now() - suiteStartTime;
      const summary = this.calculateSummary(testResults);
      
      suiteResults.push({
        suiteName: 'Image Processing Tests',
        results: testResults,
        summary,
        duration: suiteDuration
      });
      
      allResults.push(...testResults);
      console.log(`✅ Image Processing Tests completed: ${summary.passed}/${summary.total} passed (${(summary.passed/summary.total*100).toFixed(1)}%)`);
      
    } catch (error) {
      console.error('❌ Image Processing Tests failed to run:', error);
      this.addFailedSuiteResult('Image Processing Tests', error, suiteResults, allResults, Date.now() - suiteStartTime);
    }
  }

  private async runResponseValidationTestSuite(suiteResults: TestSuiteResult[], allResults: ExtendedTestResult[]): Promise<void> {
    console.log('\n📋 Running Response Validation Tests...');
    const suiteStartTime = Date.now();
    
    try {
      const results = await runResponseValidationTests();
      const testResults = this.convertResponseValidationResults(results);
      const suiteDuration = Date.now() - suiteStartTime;
      const summary = this.calculateSummary(testResults);
      
      suiteResults.push({
        suiteName: 'Response Validation Tests',
        results: testResults,
        summary,
        duration: suiteDuration
      });
      
      allResults.push(...testResults);
      console.log(`✅ Response Validation Tests completed: ${summary.passed}/${summary.total} passed (${(summary.passed/summary.total*100).toFixed(1)}%)`);
      
    } catch (error) {
      console.error('❌ Response Validation Tests failed to run:', error);
      this.addFailedSuiteResult('Response Validation Tests', error, suiteResults, allResults, Date.now() - suiteStartTime);
    }
  }

  private async runErrorHandlingTestSuite(suiteResults: TestSuiteResult[], allResults: ExtendedTestResult[]): Promise<void> {
    console.log('\n📋 Running Error Handling Tests...');
    const suiteStartTime = Date.now();
    
    try {
      const results = await runErrorHandlingTests();
      const testResults = this.convertErrorHandlingResults(results);
      const suiteDuration = Date.now() - suiteStartTime;
      const summary = this.calculateSummary(testResults);
      
      suiteResults.push({
        suiteName: 'Error Handling Tests',
        results: testResults,
        summary,
        duration: suiteDuration
      });
      
      allResults.push(...testResults);
      console.log(`✅ Error Handling Tests completed: ${summary.passed}/${summary.total} passed (${(summary.passed/summary.total*100).toFixed(1)}%)`);
      
    } catch (error) {
      console.error('❌ Error Handling Tests failed to run:', error);
      this.addFailedSuiteResult('Error Handling Tests', error, suiteResults, allResults, Date.now() - suiteStartTime);
    }
  }

  private async runPerformanceTestSuite(suiteResults: TestSuiteResult[], allResults: ExtendedTestResult[]): Promise<void> {
    console.log('\n📋 Running Performance Tests...');
    const suiteStartTime = Date.now();
    
    try {
      const results = await runPerformanceTests();
      const testResults = this.convertLoadTestResults(results);
      const suiteDuration = Date.now() - suiteStartTime;
      const summary = this.calculateSummary(testResults);
      
      suiteResults.push({
        suiteName: 'Performance Tests',
        results: testResults,
        summary,
        duration: suiteDuration
      });
      
      allResults.push(...testResults);
      console.log(`✅ Performance Tests completed: ${summary.passed}/${summary.total} passed (${(summary.passed/summary.total*100).toFixed(1)}%)`);
      
    } catch (error) {
      console.error('❌ Performance Tests failed to run:', error);
      this.addFailedSuiteResult('Performance Tests', error, suiteResults, allResults, Date.now() - suiteStartTime);
    }
  }

  private addFailedSuiteResult(
    suiteName: string, 
    error: any, 
    suiteResults: TestSuiteResult[], 
    allResults: ExtendedTestResult[], 
    duration: number
  ): void {
    const failedResult: ExtendedTestResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      testName: `${suiteName} Suite`,
      duration,
      details: { suiteError: true }
    };
    
    suiteResults.push({
      suiteName,
      results: [failedResult],
      summary: { total: 1, passed: 0, failed: 1, skipped: 0 },
      duration
    });
    
    allResults.push(failedResult);
  }

  // Convert specific test result types to ExtendedTestResult arrays
  private convertConnectionResults(results: ConnectionTestResults): ExtendedTestResult[] {
    const testResults: ExtendedTestResult[] = [];
    
    testResults.push({
      ...results.proxyHealth,
      testName: 'Proxy Health Check',
      duration: results.proxyHealth.responseTime
    });
    
    testResults.push({
      ...results.modelsList,
      testName: 'Models List Endpoint',
      duration: results.modelsList.responseTime
    });
    
    Object.entries(results.modelConnections).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Connection`,
        duration: result.responseTime
      });
    });
    
    return testResults;
  }

  private convertTextProcessingResults(results: TextProcessingTestResults): ExtendedTestResult[] {
    const testResults: ExtendedTestResult[] = [];
    
    Object.entries(results.simpleText).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Simple Text`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.systemPrompts).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} System Prompt`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.conversations).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Conversation`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.longText).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Long Text`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.unicodeText).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Unicode`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.emptyText).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Empty Text`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.streaming).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Streaming`,
        duration: result.responseTime
      });
    });
    
    return testResults;
  }

  private convertImageProcessingResults(results: ImageProcessingTestResults): ExtendedTestResult[] {
    const testResults: ExtendedTestResult[] = [];
    
    Object.entries(results.singleImage).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Single Image`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.multipleImages).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Multiple Images`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.longTextWithImage).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Long Text + Image`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.invalidImage).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Invalid Image`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.nonVisionModels).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Non-Vision Model`,
        duration: result.responseTime
      });
    });
    
    return testResults;
  }

  private convertResponseValidationResults(results: ResponseValidationTestResults): ExtendedTestResult[] {
    const testResults: ExtendedTestResult[] = [];
    
    Object.entries(results.schemaValidationTests).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Schema Validation`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.fieldValidationTests).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Field Validation`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.usageValidationTests).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Usage Validation`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.timestampValidationTests).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Timestamp Validation`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.contentValidationTests).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Content Validation`,
        duration: result.responseTime
      });
    });
    
    return testResults;
  }

  private convertErrorHandlingResults(results: ErrorHandlingTestResults): ExtendedTestResult[] {
    const testResults: ExtendedTestResult[] = [];
    
    testResults.push({
      ...results.invalidModelTest,
      testName: 'Invalid Model Error',
      duration: results.invalidModelTest.responseTime
    });
    
    Object.entries(results.malformedRequestTests).forEach(([testName, result]) => {
      testResults.push({
        ...result,
        testName: `Malformed Request: ${testName}`,
        duration: result.responseTime
      });
    });
    
    testResults.push({
      ...results.authenticationErrorTest,
      testName: 'Authentication Error',
      duration: results.authenticationErrorTest.responseTime
    });
    
    testResults.push({
      ...results.timeoutTest,
      testName: 'Timeout Test',
      duration: results.timeoutTest.responseTime
    });
    
    testResults.push({
      ...results.largePayloadTest,
      testName: 'Large Payload Test',
      duration: results.largePayloadTest.responseTime
    });
    
    Object.entries(results.invalidImageTests).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Invalid Image Error`,
        duration: result.responseTime
      });
    });
    
    testResults.push({
      ...results.rateLimitTest,
      testName: 'Rate Limit Test',
      duration: results.rateLimitTest.responseTime
    });
    
    return testResults;
  }

  private convertLoadTestResults(results: PerformanceTestResults): ExtendedTestResult[] {
    const testResults: ExtendedTestResult[] = [];
    
    Object.entries(results.responseTime).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Response Time`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.concurrentRequests).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Concurrent Requests`,
        duration: result.responseTime
      });
    });
    
    testResults.push({
      ...results.memoryUsage,
      testName: 'Memory Usage Test',
      duration: results.memoryUsage.responseTime
    });
    
    Object.entries(results.throughput).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Throughput`,
        duration: result.responseTime
      });
    });
    
    Object.entries(results.streamingPerformance).forEach(([model, result]) => {
      testResults.push({
        ...result,
        testName: `${model} Streaming Performance`,
        duration: result.responseTime
      });
    });
    
    return testResults;
  }

  private calculateSummary(results: ExtendedTestResult[]): TestSummary {
    return {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success && !r.skipped).length,
      skipped: results.filter(r => r.skipped).length
    };
  }

  private generateComprehensiveReport(
    suiteResults: TestSuiteResult[],
    allResults: ExtendedTestResult[],
    totalDuration: number
  ): ComprehensiveTestReport {
    const overallSummary = this.calculateSummary(allResults);
    const failedTests = allResults.filter(r => !r.success && !r.skipped);
    
    // Calculate performance metrics from successful tests
    const successfulTests = allResults.filter(r => r.success && r.duration);
    const responseTimes = successfulTests.map(r => r.duration!);
    
    const performanceMetrics = {
      averageResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      throughputRpm: responseTimes.length > 0 ? 
        (responseTimes.length / (totalDuration / 1000)) * 60 : 0
    };

    return {
      overallSummary: {
        totalTests: overallSummary.total,
        passed: overallSummary.passed,
        failed: overallSummary.failed,
        skipped: overallSummary.skipped,
        successRate: overallSummary.total > 0 ? 
          (overallSummary.passed / overallSummary.total) * 100 : 0,
        totalDuration
      },
      suiteResults,
      failedTests,
      performanceMetrics
    };
  }

  private printFinalReport(report: ComprehensiveTestReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(60));
    
    // Overall summary
    const { overallSummary } = report;
    console.log(`\n🎯 Overall Results:`);
    console.log(`   Total Tests: ${overallSummary.totalTests}`);
    console.log(`   ✅ Passed: ${overallSummary.passed}`);
    console.log(`   ❌ Failed: ${overallSummary.failed}`);
    console.log(`   ⏭️  Skipped: ${overallSummary.skipped}`);
    console.log(`   📈 Success Rate: ${overallSummary.successRate.toFixed(1)}%`);
    console.log(`   ⏱️  Total Duration: ${TestUtils.formatDuration(overallSummary.totalDuration)}`);

    // Suite breakdown
    console.log(`\n📋 Suite Breakdown:`);
    report.suiteResults.forEach(suite => {
      const successRate = suite.summary.total > 0 ? 
        (suite.summary.passed / suite.summary.total * 100).toFixed(1) : '0.0';
      console.log(`   ${suite.suiteName}: ${suite.summary.passed}/${suite.summary.total} (${successRate}%) - ${TestUtils.formatDuration(suite.duration)}`);
    });

    // Performance metrics
    console.log(`\n⚡ Performance Metrics:`);
    console.log(`   Average Response Time: ${report.performanceMetrics.averageResponseTime.toFixed(0)}ms`);
    console.log(`   Min Response Time: ${report.performanceMetrics.minResponseTime.toFixed(0)}ms`);
    console.log(`   Max Response Time: ${report.performanceMetrics.maxResponseTime.toFixed(0)}ms`);
    console.log(`   Throughput: ${report.performanceMetrics.throughputRpm.toFixed(1)} requests/minute`);

    // Failed tests details
    if (report.failedTests.length > 0) {
      console.log(`\n❌ Failed Tests (${report.failedTests.length}):`);
      report.failedTests.forEach(test => {
        console.log(`   • ${test.testName || 'Unknown Test'}`);
        if (test.error) {
          console.log(`     Error: ${test.error}`);
        }
        if (test.details) {
          console.log(`     Details: ${JSON.stringify(test.details, null, 2).substring(0, 200)}...`);
        }
      });
    }

    // Final status
    console.log('\n' + '='.repeat(60));
    if (overallSummary.successRate >= 90) {
      console.log('🎉 TEST SUITE PASSED - Proxy is functioning well!');
    } else if (overallSummary.successRate >= 70) {
      console.log('⚠️  TEST SUITE PARTIAL - Some issues detected');
    } else {
      console.log('🚨 TEST SUITE FAILED - Significant issues detected');
    }
    console.log('='.repeat(60));
  }
}

// Main execution function
export async function runProxyTestSuite(
  config?: Partial<TestConfig>,
  specificCategories?: string[]
): Promise<ComprehensiveTestReport> {
  // Use default config if not provided
  const defaultConfig: TestConfig = {
    proxyUrl: process.env.PROXY_URL || 'http://localhost:3001',
    apiKey: process.env.API_KEY || 'test-key',
    models: ['gpt-5-nano', 'anthropic--claude-4-sonnet', 'gemini-2.5-flash'],
    testImages: {
      redPixel: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      bluePixel: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
      yellowPixel: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      greenPixel: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkZGRkAAAABgABaADcgwAAAABJRU5ErkJggg=='
    },
    performance: {
      maxResponseTime: 30000,
      concurrentRequests: 5,
      throughputTestDuration: 30000,
      memoryThreshold: 100 * 1024 * 1024 // 100MB
    }
  };

  const finalConfig = { ...defaultConfig, ...config };
  const testSuite = new ProxyTestSuite(finalConfig);

  return await testSuite.runAllTests();
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const categories = args.length > 0 ? args : undefined;
  
  runProxyTestSuite()
    .then(report => {
      process.exit(report.overallSummary.successRate >= 70 ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test suite execution failed:', error);
      process.exit(1);
    });
}
