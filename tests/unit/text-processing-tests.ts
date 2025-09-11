#!/usr/bin/env node

/**
 * Text processing tests for SAP AI Core proxy
 * Tests various text scenarios, message formats, and content handling
 */

import { ProxyHttpClient, ResponseValidator, TestUtils, type TestResult, type ValidationResult } from '../utils/test-helpers.js';
import { TEST_MESSAGES, MODEL_CAPABILITIES } from '../utils/test-data.js';

export interface TextProcessingTestResults {
  simpleText: Record<string, TestResult>;
  systemPrompts: Record<string, TestResult>;
  conversations: Record<string, TestResult>;
  longText: Record<string, TestResult>;
  unicodeText: Record<string, TestResult>;
  emptyText: Record<string, TestResult>;
  streaming: Record<string, TestResult>;
  overallSuccess: boolean;
}

export class TextProcessingTests {
  private client: ProxyHttpClient;

  constructor() {
    this.client = new ProxyHttpClient();
  }

  async runAllTests(): Promise<TextProcessingTestResults> {
    console.log('📝 Running Text Processing Tests...\n');

    const results: TextProcessingTestResults = {
      simpleText: {},
      systemPrompts: {},
      conversations: {},
      longText: {},
      unicodeText: {},
      emptyText: {},
      streaming: {},
      overallSuccess: false
    };

    const models = Object.keys(MODEL_CAPABILITIES);

    try {
      // Test 1: Simple text messages
      console.log('💬 Testing simple text messages...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.simpleText[model] = await this.testSimpleText(model);
        TestUtils.logTestResult(`${model} Simple Text`, results.simpleText[model]);
      }

      // Test 2: System prompts
      console.log('\n🎯 Testing system prompts...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.systemPrompts[model] = await this.testSystemPrompt(model);
        TestUtils.logTestResult(`${model} System Prompt`, results.systemPrompts[model]);
      }

      // Test 3: Multi-turn conversations
      console.log('\n💭 Testing multi-turn conversations...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.conversations[model] = await this.testConversation(model);
        TestUtils.logTestResult(`${model} Conversation`, results.conversations[model]);
      }

      // Test 4: Long text handling
      console.log('\n📄 Testing long text handling...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.longText[model] = await this.testLongText(model);
        TestUtils.logTestResult(`${model} Long Text`, results.longText[model]);
      }

      // Test 5: Unicode and special characters
      console.log('\n🌍 Testing Unicode and special characters...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.unicodeText[model] = await this.testUnicodeText(model);
        TestUtils.logTestResult(`${model} Unicode Text`, results.unicodeText[model]);
      }

      // Test 6: Empty text handling
      console.log('\n🔍 Testing empty text handling...');
      for (const model of models) {
        console.log(`   Testing ${model}...`);
        results.emptyText[model] = await this.testEmptyText(model);
        TestUtils.logTestResult(`${model} Empty Text`, results.emptyText[model]);
      }

      // Test 7: Streaming (for supported models)
      console.log('\n🌊 Testing streaming responses...');
      for (const model of models) {
        const capabilities = MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES];
        if (capabilities.supportsStreaming) {
          console.log(`   Testing ${model} streaming...`);
          results.streaming[model] = await this.testStreaming(model);
          TestUtils.logTestResult(`${model} Streaming`, results.streaming[model]);
        } else {
          console.log(`   Skipping ${model} (no streaming support)`);
          results.streaming[model] = { success: true, data: { skipped: true } };
        }
      }

      // Calculate overall success
      const allResults = [
        ...Object.values(results.simpleText),
        ...Object.values(results.systemPrompts),
        ...Object.values(results.conversations),
        ...Object.values(results.longText),
        ...Object.values(results.unicodeText),
        ...Object.values(results.emptyText),
        ...Object.values(results.streaming).filter(r => !r.data?.skipped)
      ];

      const successfulTests = allResults.filter(r => r.success).length;
      results.overallSuccess = successfulTests > allResults.length * 0.7; // 70% success rate

      console.log(`\n🎯 Text Processing Tests ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      console.log(`   Success Rate: ${successfulTests}/${allResults.length} (${Math.round(successfulTests/allResults.length*100)}%)`);
      
      return results;

    } catch (error) {
      console.error('💥 Text processing tests failed with error:', error);
      return results;
    }
  }

  private async testSimpleText(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.SIMPLE_TEXT, { max_tokens: 50 })
      );

      if (!result.success) {
        return result;
      }

      // Validate response structure
      const validation = ResponseValidator.validateOpenAIResponse(result.data);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Response validation failed: ${validation.errors.join(', ')}`,
          responseTime: result.responseTime
        };
      }

      const content = result.data.choices[0].message.content;
      
      // Check that response is reasonable for a greeting
      if (content.length < 2) {
        return {
          success: false,
          error: 'Response too short for greeting',
          responseTime: result.responseTime
        };
      }

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100)
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

  private async testSystemPrompt(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.SYSTEM_PROMPT, { max_tokens: 20 })
      );

      if (!result.success) {
        return result;
      }

      // Validate response structure
      const validation = ResponseValidator.validateOpenAIResponse(result.data);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Response validation failed: ${validation.errors.join(', ')}`,
          responseTime: result.responseTime
        };
      }

      const content = result.data.choices[0].message.content;
      
      // Check that response follows system prompt (should be concise)
      // For "What is 2+2?" we expect a short answer
      if (content.length > 100) {
        return {
          success: false,
          error: 'Response not concise despite system prompt',
          responseTime: result.responseTime,
          data: { content }
        };
      }

      // Check if response contains the answer
      if (!content.includes('4')) {
        return {
          success: false,
          error: 'Response does not contain correct answer to 2+2',
          responseTime: result.responseTime,
          data: { content }
        };
      }

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content,
          followedSystemPrompt: content.length <= 100
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

  private async testConversation(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.CONVERSATION, { max_tokens: 100 })
      );

      if (!result.success) {
        return result;
      }

      // Validate response structure
      const validation = ResponseValidator.validateOpenAIResponse(result.data);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Response validation failed: ${validation.errors.join(', ')}`,
          responseTime: result.responseTime
        };
      }

      const content = result.data.choices[0].message.content;
      
      // Check that response is contextually appropriate
      // Should be about Paris population since that's the follow-up question
      const contextKeywords = ['population', 'people', 'million', 'inhabitants', 'residents'];
      const hasContext = contextKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
      );

      if (!hasContext) {
        return {
          success: false,
          error: 'Response does not seem contextually appropriate for conversation',
          responseTime: result.responseTime,
          data: { content, expectedKeywords: contextKeywords }
        };
      }

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          hasContextualRelevance: hasContext
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

  private async testLongText(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.LONG_TEXT, { max_tokens: 50 }),
        2, // Reduced retries for long text
        3000 // Longer delay
      );

      if (!result.success) {
        return result;
      }

      // Validate response structure
      const validation = ResponseValidator.validateOpenAIResponse(result.data);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Response validation failed: ${validation.errors.join(', ')}`,
          responseTime: result.responseTime
        };
      }

      const content = result.data.choices[0].message.content;
      
      // Check that model handled long input appropriately
      if (content.length < 5) {
        return {
          success: false,
          error: 'Response too short for long text input',
          responseTime: result.responseTime
        };
      }

      return {
        success: true,
        data: {
          inputLength: TEST_MESSAGES.LONG_TEXT[0].content.length,
          outputLength: content.length,
          responsePreview: content.substring(0, 100),
          handledLongInput: true
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

  private async testUnicodeText(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.UNICODE_TEXT, { max_tokens: 100 })
      );

      if (!result.success) {
        return result;
      }

      // Validate response structure
      const validation = ResponseValidator.validateOpenAIResponse(result.data);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Response validation failed: ${validation.errors.join(', ')}`,
          responseTime: result.responseTime
        };
      }

      const content = result.data.choices[0].message.content;
      
      // Check that model handled Unicode appropriately
      if (content.length < 10) {
        return {
          success: false,
          error: 'Response too short for Unicode text input',
          responseTime: result.responseTime
        };
      }

      // Check if response acknowledges Unicode handling
      const unicodeKeywords = ['unicode', 'characters', 'emoji', 'international', 'language'];
      const acknowledgesUnicode = unicodeKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
      );

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          acknowledgesUnicode,
          handledUnicode: true
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

  private async testEmptyText(model: string): Promise<TestResult> {
    try {
      const result = await this.client.chatCompletion(model, TEST_MESSAGES.EMPTY_MESSAGE, { max_tokens: 50 });

      // Empty messages should either be handled gracefully or return an error
      if (!result.success) {
        // Check if it's a validation error (which is acceptable)
        if (result.error && result.error.includes('empty')) {
          return {
            success: true,
            data: { handledEmptyGracefully: true, errorMessage: result.error },
            responseTime: result.responseTime
          };
        }
        return result;
      }

      // If it succeeded, validate the response
      const validation = ResponseValidator.validateOpenAIResponse(result.data);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Response validation failed: ${validation.errors.join(', ')}`,
          responseTime: result.responseTime
        };
      }

      const content = result.data.choices[0].message.content;

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          handledEmptyInput: true
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

  private async testStreaming(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.streamingChatCompletion(model, TEST_MESSAGES.GREETING, { max_tokens: 50 })
      );

      if (!result.success) {
        return result;
      }

      // Validate streaming response
      const streamData = result.data;
      if (!streamData.streaming) {
        return {
          success: false,
          error: 'Response not marked as streaming',
          responseTime: result.responseTime
        };
      }

      if (!streamData.content || streamData.content.length < 5) {
        return {
          success: false,
          error: 'Streaming response content too short',
          responseTime: result.responseTime
        };
      }

      if (streamData.chunks < 1) {
        return {
          success: false,
          error: 'No streaming chunks received',
          responseTime: result.responseTime
        };
      }

      return {
        success: true,
        data: {
          contentLength: streamData.content.length,
          chunksReceived: streamData.chunks,
          responsePreview: streamData.content.substring(0, 100),
          streamingWorking: true
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
}

// Main execution function
export async function runTextProcessingTests(): Promise<TextProcessingTestResults> {
  const textTests = new TextProcessingTests();
  return await textTests.runAllTests();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTextProcessingTests()
    .then(results => {
      console.log('\n📊 Text Processing Test Summary:');
      
      const categories = [
        { name: 'Simple Text', results: results.simpleText },
        { name: 'System Prompts', results: results.systemPrompts },
        { name: 'Conversations', results: results.conversations },
        { name: 'Long Text', results: results.longText },
        { name: 'Unicode Text', results: results.unicodeText },
        { name: 'Empty Text', results: results.emptyText },
        { name: 'Streaming', results: results.streaming }
      ];

      categories.forEach(category => {
        const categoryResults = Object.entries(category.results);
        const successful = categoryResults.filter(([, result]) => result.success).length;
        const total = categoryResults.filter(([, result]) => !result.data?.skipped).length;
        
        console.log(`   ${category.name}: ${successful}/${total} successful`);
        categoryResults.forEach(([model, result]) => {
          if (result.data?.skipped) {
            console.log(`     ${model}: ⏭️ (skipped)`);
          } else {
            console.log(`     ${model}: ${result.success ? '✅' : '❌'}`);
          }
        });
      });
      
      console.log(`\n🎯 Overall: ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Text processing tests failed:', error);
      process.exit(1);
    });
}

export default { TextProcessingTests, runTextProcessingTests };
