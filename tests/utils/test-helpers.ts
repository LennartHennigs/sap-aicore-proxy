#!/usr/bin/env node

/**
 * Test helpers and utilities for SAP AI Core proxy testing
 * Contains HTTP client, validation functions, and common test utilities
 */

import { TEST_CONFIG } from './test-data.js';

// Types for test results
export interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
  responseTime?: number;
  statusCode?: number;
  headers?: Record<string, string>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PerformanceMetrics {
  responseTime: number;
  memoryUsage?: number;
  cpuUsage?: number;
  timestamp: number;
}

// HTTP Client for proxy requests
export class ProxyHttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(baseUrl = TEST_CONFIG.PROXY_URL, apiKey = TEST_CONFIG.API_KEY, timeout = TEST_CONFIG.TIMEOUT) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  async makeRequest(endpoint: string, options: RequestInit = {}): Promise<TestResult> {
    const startTime = Date.now();
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...options.headers
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        success: response.ok,
        data,
        statusCode: response.status,
        headers,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${responseText}`
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime
      };
    }
  }

  async chatCompletion(model: string, messages: any[], options: any = {}): Promise<TestResult> {
    return this.makeRequest('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 100,
        ...options
      })
    });
  }

  async streamingChatCompletion(model: string, messages: any[], options: any = {}): Promise<TestResult> {
    const startTime = Date.now();
    const url = `${this.baseUrl}/v1/chat/completions`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: 100,
          ...options
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          statusCode: response.status,
          responseTime: Date.now() - startTime
        };
      }

      // Parse streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        return {
          success: false,
          error: 'No response body reader available',
          responseTime: Date.now() - startTime
        };
      }

      const chunks: string[] = [];
      let fullContent = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);
          chunks.push(chunk);

          // Parse SSE chunks
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                }
              } catch {
                // Ignore parsing errors for individual chunks
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return {
        success: true,
        data: {
          content: fullContent,
          chunks: chunks.length,
          streaming: true
        },
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  async healthCheck(): Promise<TestResult> {
    return this.makeRequest('/health');
  }

  async listModels(): Promise<TestResult> {
    return this.makeRequest('/v1/models');
  }
}

// Response validation functions
export class ResponseValidator {
  static validateOpenAIResponse(response: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    const required = TEST_CONFIG.OPENAI_RESPONSE_SCHEMA.required;
    for (const field of required) {
      if (!(field in response)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate choices array
    if (response.choices) {
      if (!Array.isArray(response.choices)) {
        errors.push('choices must be an array');
      } else if (response.choices.length === 0) {
        errors.push('choices array cannot be empty');
      } else {
        // Validate first choice
        const choice = response.choices[0];
        const choicesRequired = TEST_CONFIG.OPENAI_RESPONSE_SCHEMA.choices_required;
        
        for (const field of choicesRequired) {
          if (!(field in choice)) {
            errors.push(`Missing required field in choices[0]: ${field}`);
          }
        }

        // Validate message structure
        if (choice.message) {
          const messageRequired = TEST_CONFIG.OPENAI_RESPONSE_SCHEMA.message_required;
          for (const field of messageRequired) {
            if (!(field in choice.message)) {
              errors.push(`Missing required field in choices[0].message: ${field}`);
            }
          }

          // Check content is not empty
          if (!choice.message.content || choice.message.content.trim() === '') {
            warnings.push('Message content is empty');
          }
        }
      }
    }

    // Validate usage object (optional but should be present)
    if (response.usage) {
      const usageFields = ['prompt_tokens', 'completion_tokens', 'total_tokens'];
      for (const field of usageFields) {
        if (!(field in response.usage)) {
          warnings.push(`Missing usage field: ${field}`);
        }
      }
    } else {
      warnings.push('Usage information not provided');
    }

    // Validate model field matches expected format
    if (response.model && typeof response.model !== 'string') {
      errors.push('Model field must be a string');
    }

    // Validate timestamps
    if (response.created && (typeof response.created !== 'number' || response.created <= 0)) {
      errors.push('Created timestamp must be a positive number');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateVisionResponse(response: any, expectedPattern: RegExp): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // First validate basic OpenAI structure
    const basicValidation = this.validateOpenAIResponse(response);
    errors.push(...basicValidation.errors);
    warnings.push(...basicValidation.warnings);

    // Check if response content matches expected vision pattern
    const content = response.choices?.[0]?.message?.content;
    if (content && typeof content === 'string') {
      if (!expectedPattern.test(content)) {
        warnings.push(`Response content doesn't match expected vision pattern: ${expectedPattern}`);
      }
    } else {
      errors.push('No valid content found in vision response');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateErrorResponse(response: any, expectedStatusCode?: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if it has error structure
    if (!response.error) {
      errors.push('Error response must contain error field');
    } else {
      // Validate error structure
      if (!response.error.message) {
        errors.push('Error must contain message field');
      }
      if (!response.error.type) {
        warnings.push('Error should contain type field');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Performance measurement utilities
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];

  recordMetric(responseTime: number, memoryUsage?: number): void {
    this.metrics.push({
      responseTime,
      memoryUsage,
      timestamp: Date.now()
    });
  }

  getAverageResponseTime(): number {
    if (this.metrics.length === 0) return 0;
    const total = this.metrics.reduce((sum, metric) => sum + metric.responseTime, 0);
    return total / this.metrics.length;
  }

  getMaxResponseTime(): number {
    if (this.metrics.length === 0) return 0;
    return Math.max(...this.metrics.map(m => m.responseTime));
  }

  getMinResponseTime(): number {
    if (this.metrics.length === 0) return 0;
    return Math.min(...this.metrics.map(m => m.responseTime));
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics = [];
  }

  validatePerformance(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const avgResponseTime = this.getAverageResponseTime();
    const maxResponseTime = this.getMaxResponseTime();

    if (maxResponseTime > TEST_CONFIG.PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS) {
      errors.push(`Maximum response time ${maxResponseTime}ms exceeds threshold ${TEST_CONFIG.PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS}ms`);
    }

    if (avgResponseTime > TEST_CONFIG.PERFORMANCE_THRESHOLDS.RESPONSE_TIME_MS * 0.7) {
      warnings.push(`Average response time ${avgResponseTime}ms is approaching threshold`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Utility functions
export class TestUtils {
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries = TEST_CONFIG.MAX_RETRIES,
    delay = TEST_CONFIG.RETRY_DELAY
  ): Promise<T> {
    let lastError: Error;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (i < maxRetries) {
          await this.sleep(delay);
          delay *= 1.5; // Exponential backoff
        }
      }
    }

    throw lastError!;
  }

  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  static generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static logTestResult(testName: string, result: TestResult, details?: any): void {
    const status = result.success ? '✅' : '❌';
    const time = result.responseTime ? ` (${this.formatDuration(result.responseTime)})` : '';
    
    console.log(`${status} ${testName}${time}`);
    
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    if (details) {
      console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  static logValidationResult(validationName: string, result: ValidationResult): void {
    const status = result.isValid ? '✅' : '❌';
    console.log(`${status} ${validationName}`);
    
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.join(', ')}`);
    }
    
    if (result.warnings.length > 0) {
      console.log(`   Warnings: ${result.warnings.join(', ')}`);
    }
  }
}

// Export default object
export default {
  ProxyHttpClient,
  ResponseValidator,
  PerformanceMonitor,
  TestUtils
};
