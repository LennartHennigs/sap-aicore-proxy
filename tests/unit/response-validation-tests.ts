#!/usr/bin/env node

/**
 * Response validation tests for SAP AI Core proxy
 * Tests OpenAI-compatible response formats, schema validation, and data integrity
 */

import { ProxyHttpClient, ResponseValidator, TestUtils, type TestResult, type ValidationResult } from '../utils/test-helpers.js';
import { TEST_MESSAGES, MODEL_CAPABILITIES } from '../utils/test-data.js';

export interface ResponseValidationTestResults {
  schemaValidation: Record<string, TestResult>;
  fieldValidation: Record<string, TestResult>;
  usageValidation: Record<string, TestResult>;
  timestampValidation: Record<string, TestResult>;
  contentValidation: Record<string, TestResult>;
  overallSuccess: boolean;
}

export class ResponseValidationTests {
  private client: ProxyHttpClient;

  constructor() {
    this.client = new ProxyHttpClient();
  }

  async runAllTests(): Promise<ResponseValidationTestResults> {
    console.log('✅ Running Response Validation Tests...\n');

    const results: ResponseValidationTestResults = {
      schemaValidation: {},
      fieldValidation: {},
      usageValidation: {},
      timestampValidation: {},
      contentValidation: {},
      overallSuccess: false
    };

    const models = Object.keys(MODEL_CAPABILITIES);

    try {
      // Test 1: OpenAI schema validation
      console.log('📋 Testing OpenAI schema validation...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.schemaValidation[model] = await this.testSchemaValidation(model);
        TestUtils.logTestResult(`${model} Schema Validation`, results.schemaValidation[model]);
      }

      // Test 2: Required field validation
      console.log('\n🔍 Testing required field validation...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.fieldValidation[model] = await this.testFieldValidation(model);
        TestUtils.logTestResult(`${model} Field Validation`, results.fieldValidation[model]);
      }

      // Test 3: Usage statistics validation
      console.log('\n📊 Testing usage statistics validation...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.usageValidation[model] = await this.testUsageValidation(model);
        TestUtils.logTestResult(`${model} Usage Validation`, results.usageValidation[model]);
      }

      // Test 4: Timestamp validation
      console.log('\n⏰ Testing timestamp validation...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.timestampValidation[model] = await this.testTimestampValidation(model);
        TestUtils.logTestResult(`${model} Timestamp Validation`, results.timestampValidation[model]);
      }

      // Test 5: Content validation
      console.log('\n📝 Testing content validation...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.contentValidation[model] = await this.testContentValidation(model);
        TestUtils.logTestResult(`${model} Content Validation`, results.contentValidation[model]);
      }

      // Calculate overall success
      const allResults = [
        ...Object.values(results.schemaValidation),
        ...Object.values(results.fieldValidation),
        ...Object.values(results.usageValidation),
        ...Object.values(results.timestampValidation),
        ...Object.values(results.contentValidation)
      ];

      const successfulTests = allResults.filter(r => r.success).length;
      results.overallSuccess = successfulTests > allResults.length * 0.8; // 80% success rate for validation

      console.log(`\n🎯 Response Validation Tests ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      console.log(`   Success Rate: ${successfulTests}/${allResults.length} (${Math.round(successfulTests/allResults.length*100)}%)`);
      
      return results;

    } catch (error) {
      console.error('💥 Response validation tests failed with error:', error);
      return results;
    }
  }

  private async testSchemaValidation(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 50 })
      );

      if (!result.success) {
        return result;
      }

      // Validate OpenAI schema
      const validation = ResponseValidator.validateOpenAIResponse(result.data);
      
      if (!validation.isValid) {
        return {
          success: false,
          error: `Schema validation failed: ${validation.errors.join(', ')}`,
          responseTime: result.responseTime,
          data: { 
            response: result.data,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings
          }
        };
      }

      return {
        success: true,
        data: {
          schemaValid: true,
          warnings: validation.warnings,
          responseStructure: {
            hasId: 'id' in result.data,
            hasObject: 'object' in result.data,
            hasCreated: 'created' in result.data,
            hasModel: 'model' in result.data,
            hasChoices: 'choices' in result.data,
            hasUsage: 'usage' in result.data
          }
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

  private async testFieldValidation(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 50 })
      );

      if (!result.success) {
        return result;
      }

      const response = result.data;
      const fieldValidation: Record<string, any> = {};

      // Validate ID field
      if (response.id) {
        fieldValidation.id = {
          present: true,
          type: typeof response.id,
          format: /^chatcmpl-\d+$/.test(response.id) ? 'valid' : 'custom',
          value: response.id
        };
      } else {
        fieldValidation.id = { present: false };
      }

      // Validate object field
      if (response.object) {
        fieldValidation.object = {
          present: true,
          type: typeof response.object,
          value: response.object,
          isCorrect: response.object === 'chat.completion'
        };
      } else {
        fieldValidation.object = { present: false };
      }

      // Validate model field
      if (response.model) {
        fieldValidation.model = {
          present: true,
          type: typeof response.model,
          value: response.model,
          matchesRequest: response.model === model
        };
      } else {
        fieldValidation.model = { present: false };
      }

      // Validate choices array
      if (response.choices) {
        fieldValidation.choices = {
          present: true,
          type: typeof response.choices,
          isArray: Array.isArray(response.choices),
          length: Array.isArray(response.choices) ? response.choices.length : 0,
          firstChoice: Array.isArray(response.choices) && response.choices.length > 0 ? {
            hasIndex: 'index' in response.choices[0],
            hasMessage: 'message' in response.choices[0],
            hasFinishReason: 'finish_reason' in response.choices[0],
            messageStructure: response.choices[0].message ? {
              hasRole: 'role' in response.choices[0].message,
              hasContent: 'content' in response.choices[0].message,
              roleValue: response.choices[0].message.role,
              contentType: typeof response.choices[0].message.content
            } : null
          } : null
        };
      } else {
        fieldValidation.choices = { present: false };
      }

      // Check for any critical validation failures
      const criticalErrors: string[] = [];
      
      if (!fieldValidation.id.present) criticalErrors.push('Missing ID field');
      if (!fieldValidation.object.present || !fieldValidation.object.isCorrect) criticalErrors.push('Invalid object field');
      if (!fieldValidation.model.present) criticalErrors.push('Missing model field');
      if (!fieldValidation.choices.present || !fieldValidation.choices.isArray) criticalErrors.push('Invalid choices field');

      return {
        success: criticalErrors.length === 0,
        error: criticalErrors.length > 0 ? criticalErrors.join(', ') : undefined,
        data: fieldValidation,
        responseTime: result.responseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testUsageValidation(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 50 })
      );

      if (!result.success) {
        return result;
      }

      const response = result.data;
      const usageValidation: Record<string, any> = {};

      if (response.usage) {
        usageValidation.present = true;
        usageValidation.type = typeof response.usage;
        
        // Check required usage fields
        const requiredFields = ['prompt_tokens', 'completion_tokens', 'total_tokens'];
        usageValidation.fields = {};
        
        for (const field of requiredFields) {
          if (field in response.usage) {
            usageValidation.fields[field] = {
              present: true,
              type: typeof response.usage[field],
              value: response.usage[field],
              isNumber: typeof response.usage[field] === 'number',
              isNonNegative: typeof response.usage[field] === 'number' && response.usage[field] >= 0
            };
          } else {
            usageValidation.fields[field] = { present: false };
          }
        }

        // Validate total tokens calculation
        if (response.usage.prompt_tokens !== undefined && 
            response.usage.completion_tokens !== undefined && 
            response.usage.total_tokens !== undefined) {
          const expectedTotal = response.usage.prompt_tokens + response.usage.completion_tokens;
          usageValidation.totalCalculation = {
            expected: expectedTotal,
            actual: response.usage.total_tokens,
            correct: expectedTotal === response.usage.total_tokens
          };
        }

      } else {
        usageValidation.present = false;
      }

      // Usage is optional but if present should be valid
      const hasUsageErrors = response.usage && (
        !usageValidation.fields.prompt_tokens?.isNonNegative ||
        !usageValidation.fields.completion_tokens?.isNonNegative ||
        !usageValidation.fields.total_tokens?.isNonNegative ||
        (usageValidation.totalCalculation && !usageValidation.totalCalculation.correct)
      );

      return {
        success: !hasUsageErrors,
        error: hasUsageErrors ? 'Usage validation failed' : undefined,
        data: usageValidation,
        responseTime: result.responseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testTimestampValidation(model: string): Promise<TestResult> {
    try {
      const requestTime = Math.floor(Date.now() / 1000);
      
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 50 })
      );

      if (!result.success) {
        return result;
      }

      const response = result.data;
      const timestampValidation: Record<string, any> = {};

      if (response.created) {
        timestampValidation.present = true;
        timestampValidation.type = typeof response.created;
        timestampValidation.value = response.created;
        timestampValidation.isNumber = typeof response.created === 'number';
        
        if (typeof response.created === 'number') {
          timestampValidation.isPositive = response.created > 0;
          timestampValidation.isReasonable = response.created > 1600000000; // After 2020
          timestampValidation.isNotFuture = response.created <= Math.floor(Date.now() / 1000) + 60; // Allow 1 minute buffer
          timestampValidation.isRecent = Math.abs(response.created - requestTime) < 300; // Within 5 minutes
          
          // Convert to human readable
          timestampValidation.humanReadable = new Date(response.created * 1000).toISOString();
        }
      } else {
        timestampValidation.present = false;
      }

      const hasTimestampErrors = !timestampValidation.present || 
                               !timestampValidation.isNumber || 
                               !timestampValidation.isPositive || 
                               !timestampValidation.isReasonable ||
                               !timestampValidation.isNotFuture;

      return {
        success: !hasTimestampErrors,
        error: hasTimestampErrors ? 'Timestamp validation failed' : undefined,
        data: timestampValidation,
        responseTime: result.responseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testContentValidation(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 50 })
      );

      if (!result.success) {
        return result;
      }

      const response = result.data;
      const contentValidation: Record<string, any> = {};

      if (response.choices && Array.isArray(response.choices) && response.choices.length > 0) {
        const firstChoice = response.choices[0];
        
        if (firstChoice.message) {
          const message = firstChoice.message;
          
          contentValidation.message = {
            present: true,
            hasRole: 'role' in message,
            hasContent: 'content' in message,
            roleValue: message.role,
            roleValid: message.role === 'assistant',
            contentType: typeof message.content,
            contentLength: typeof message.content === 'string' ? message.content.length : 0,
            contentNotEmpty: typeof message.content === 'string' && message.content.trim().length > 0,
            contentPreview: typeof message.content === 'string' ? message.content.substring(0, 100) : null
          };

          // Check for common content issues
          if (typeof message.content === 'string') {
            contentValidation.contentAnalysis = {
              hasText: message.content.trim().length > 0,
              isNotPlaceholder: !message.content.toLowerCase().includes('placeholder'),
              isNotError: !message.content.toLowerCase().includes('error occurred'),
              isNotEmpty: message.content !== '',
              hasReasonableLength: message.content.length >= 2 && message.content.length <= 10000,
              encoding: {
                hasUnicode: /[^\x00-\x7F]/.test(message.content),
                hasEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(message.content),
                hasSpecialChars: /[<>&"']/.test(message.content)
              }
            };
          }
        } else {
          contentValidation.message = { present: false };
        }

        // Validate finish_reason
        if ('finish_reason' in firstChoice) {
          contentValidation.finishReason = {
            present: true,
            value: firstChoice.finish_reason,
            type: typeof firstChoice.finish_reason,
            isValid: ['stop', 'length', 'content_filter', 'tool_calls', 'function_call'].includes(firstChoice.finish_reason)
          };
        } else {
          contentValidation.finishReason = { present: false };
        }

      } else {
        contentValidation.message = { present: false };
        contentValidation.finishReason = { present: false };
      }

      const hasContentErrors = !contentValidation.message?.present ||
                              !contentValidation.message?.hasRole ||
                              !contentValidation.message?.hasContent ||
                              !contentValidation.message?.roleValid ||
                              !contentValidation.message?.contentNotEmpty;

      return {
        success: !hasContentErrors,
        error: hasContentErrors ? 'Content validation failed' : undefined,
        data: contentValidation,
        responseTime: result.responseTime
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
export async function runResponseValidationTests(): Promise<ResponseValidationTestResults> {
  const validationTests = new ResponseValidationTests();
  return await validationTests.runAllTests();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runResponseValidationTests()
    .then(results => {
      console.log('\n📊 Response Validation Test Summary:');
      
      const categories = [
        { name: 'Schema Validation', results: results.schemaValidation },
        { name: 'Field Validation', results: results.fieldValidation },
        { name: 'Usage Validation', results: results.usageValidation },
        { name: 'Timestamp Validation', results: results.timestampValidation },
        { name: 'Content Validation', results: results.contentValidation }
      ];

      categories.forEach(category => {
        const categoryResults = Object.entries(category.results);
        const successful = categoryResults.filter(([, result]) => result.success).length;
        const total = categoryResults.length;
        
        console.log(`   ${category.name}: ${successful}/${total} successful`);
        categoryResults.forEach(([model, result]) => {
          console.log(`     ${model}: ${result.success ? '✅' : '❌'}`);
        });
      });
      
      console.log(`\n🎯 Overall: ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Response validation tests failed:', error);
      process.exit(1);
    });
}

export default { ResponseValidationTests, runResponseValidationTests };
