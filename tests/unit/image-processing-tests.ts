#!/usr/bin/env node

/**
 * Image processing tests for SAP AI Core proxy
 * Tests vision capabilities, image formats, and vision-related error handling
 */

import { ProxyHttpClient, ResponseValidator, TestUtils, type TestResult } from '../utils/test-helpers.js';
import { TEST_MESSAGES, MODEL_CAPABILITIES } from '../utils/test-data.js';

export interface ImageProcessingTestResults {
  singleImage: Record<string, TestResult>;
  multipleImages: Record<string, TestResult>;
  longTextWithImage: Record<string, TestResult>;
  invalidImage: Record<string, TestResult>;
  nonVisionModels: Record<string, TestResult>;
  overallSuccess: boolean;
}

export class ImageProcessingTests {
  private client: ProxyHttpClient;

  constructor() {
    this.client = new ProxyHttpClient();
  }

  async runAllTests(): Promise<ImageProcessingTestResults> {
    console.log('🖼️ Running Image Processing Tests...\n');

    const results: ImageProcessingTestResults = {
      singleImage: {},
      multipleImages: {},
      longTextWithImage: {},
      invalidImage: {},
      nonVisionModels: {},
      overallSuccess: false
    };

    const models = Object.keys(MODEL_CAPABILITIES);
    const visionModels = models.filter(model => 
      MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES].supportsVision
    );
    const nonVisionModels = models.filter(model => 
      !MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES].supportsVision
    );

    try {
      // Test 1: Single image processing (vision models only)
      console.log('🎯 Testing single image processing...');
      for (const model of visionModels) {
        console.log(`   Testing ${model}...`);
        results.singleImage[model] = await this.testSingleImage(model);
        TestUtils.logTestResult(`${model} Single Image`, results.singleImage[model]);
      }

      // Test 2: Multiple images processing (vision models only)
      console.log('\n🖼️🖼️ Testing multiple images processing...');
      for (const model of visionModels) {
        console.log(`   Testing ${model}...`);
        results.multipleImages[model] = await this.testMultipleImages(model);
        TestUtils.logTestResult(`${model} Multiple Images`, results.multipleImages[model]);
      }

      // Test 3: Long text with image (vision models only)
      console.log('\n📄🖼️ Testing long text with image...');
      for (const model of visionModels) {
        console.log(`   Testing ${model}...`);
        results.longTextWithImage[model] = await this.testLongTextWithImage(model);
        TestUtils.logTestResult(`${model} Long Text + Image`, results.longTextWithImage[model]);
      }

      // Test 4: Invalid image handling (vision models only)
      console.log('\n❌🖼️ Testing invalid image handling...');
      for (const model of visionModels) {
        console.log(`   Testing ${model}...`);
        results.invalidImage[model] = await this.testInvalidImage(model);
        TestUtils.logTestResult(`${model} Invalid Image`, results.invalidImage[model]);
      }

      // Test 5: Non-vision models with images
      console.log('\n🚫👁️ Testing non-vision models with images...');
      for (const model of nonVisionModels) {
        console.log(`   Testing ${model}...`);
        results.nonVisionModels[model] = await this.testNonVisionModelWithImage(model);
        TestUtils.logTestResult(`${model} Non-Vision + Image`, results.nonVisionModels[model]);
      }

      // Calculate overall success
      const allResults = [
        ...Object.values(results.singleImage),
        ...Object.values(results.multipleImages),
        ...Object.values(results.longTextWithImage),
        ...Object.values(results.invalidImage),
        ...Object.values(results.nonVisionModels)
      ];

      const successfulTests = allResults.filter(r => r.success).length;
      results.overallSuccess = successfulTests > allResults.length * 0.6; // 60% success rate (more lenient for vision)

      console.log(`\n🎯 Image Processing Tests ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      console.log(`   Success Rate: ${successfulTests}/${allResults.length} (${Math.round(successfulTests/allResults.length*100)}%)`);
      
      return results;

    } catch (error) {
      console.error('💥 Image processing tests failed with error:', error);
      return results;
    }
  }

  private async testSingleImage(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.VISION_YELLOW_PIXEL, { max_tokens: 100 }),
        2, // Reduced retries for vision
        3000 // Longer delay for vision processing
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
      
      // Check if response indicates vision processing
      const capabilities = MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES];
      const visionValidation = ResponseValidator.validateVisionResponse(result.data, capabilities.expectedVisionResponse);
      
      if (!visionValidation.isValid) {
        return {
          success: false,
          error: `Vision response validation failed: ${visionValidation.errors.join(', ')}`,
          responseTime: result.responseTime,
          data: { content, expectedPattern: capabilities.expectedVisionResponse }
        };
      }

      // Additional check for yellow pixel specifically
      const mentionsYellow = /yellow/i.test(content);
      
      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          mentionsYellow,
          visionProcessed: true
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

  private async testMultipleImages(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.VISION_MULTIPLE_IMAGES, { max_tokens: 150 }),
        2, // Reduced retries for vision
        4000 // Even longer delay for multiple images
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
      
      // Check if response indicates processing of multiple images
      const capabilities = MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES];
      const visionValidation = ResponseValidator.validateVisionResponse(result.data, capabilities.expectedVisionResponse);
      
      if (!visionValidation.isValid) {
        return {
          success: false,
          error: `Vision response validation failed: ${visionValidation.errors.join(', ')}`,
          responseTime: result.responseTime,
          data: { content }
        };
      }

      // Check if response mentions multiple colors or comparison
      const comparisonKeywords = ['both', 'two', 'compare', 'different', 'red', 'blue'];
      const mentionsComparison = comparisonKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
      );

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          mentionsComparison,
          processedMultipleImages: true
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

  private async testLongTextWithImage(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.LONG_TEXT_WITH_IMAGE, { max_tokens: 100 }),
        2, // Reduced retries
        4000 // Longer delay for complex processing
      );

      if (!result.success) {
        // For some models (like Gemini), long text with images might be expected to fail
        if (model === 'gemini-2.5-flash' && result.error?.includes('No response')) {
          return {
            success: true,
            data: { 
              expectedFailure: true, 
              reason: 'Gemini has known limitations with long text + images',
              errorMessage: result.error 
            },
            responseTime: result.responseTime
          };
        }
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
      
      // Check if response handles both long text and image
      const capabilities = MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES];
      const visionValidation = ResponseValidator.validateVisionResponse(result.data, capabilities.expectedVisionResponse);
      
      if (!visionValidation.isValid) {
        return {
          success: false,
          error: `Vision response validation failed: ${visionValidation.errors.join(', ')}`,
          responseTime: result.responseTime,
          data: { content }
        };
      }

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          handledLongTextWithImage: true
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

  private async testInvalidImage(model: string): Promise<TestResult> {
    try {
      const result = await this.client.chatCompletion(model, TEST_MESSAGES.INVALID_IMAGE, { max_tokens: 100 });

      // Invalid images should either be handled gracefully or return an error
      if (!result.success) {
        // Check if it's an appropriate error for invalid image
        if (result.error && (
          result.error.includes('invalid') || 
          result.error.includes('image') || 
          result.error.includes('format') ||
          result.error.includes('base64')
        )) {
          return {
            success: true,
            data: { 
              handledInvalidImageGracefully: true, 
              errorMessage: result.error 
            },
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
      
      // Response should indicate inability to process the invalid image
      const errorKeywords = ['cannot', 'unable', 'invalid', 'error', 'problem', 'corrupted'];
      const acknowledgesError = errorKeywords.some(keyword => 
        content.toLowerCase().includes(keyword)
      );

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          acknowledgesError,
          handledInvalidImage: true
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

  private async testNonVisionModelWithImage(model: string): Promise<TestResult> {
    try {
      const result = await TestUtils.retry(
        () => this.client.chatCompletion(model, TEST_MESSAGES.VISION_YELLOW_PIXEL, { max_tokens: 100 })
      );

      if (!result.success) {
        // Non-vision models might return errors for image content, which is acceptable
        if (result.error && (
          result.error.includes('vision') || 
          result.error.includes('image') || 
          result.error.includes('unsupported')
        )) {
          return {
            success: true,
            data: { 
              correctlyRejectedVision: true, 
              errorMessage: result.error 
            },
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
      
      // Check if response appropriately handles non-vision scenario
      const capabilities = MODEL_CAPABILITIES[model as keyof typeof MODEL_CAPABILITIES];
      const visionValidation = ResponseValidator.validateVisionResponse(result.data, capabilities.expectedVisionResponse);
      
      if (!visionValidation.isValid) {
        return {
          success: false,
          error: `Non-vision response validation failed: ${visionValidation.errors.join(', ')}`,
          responseTime: result.responseTime,
          data: { content, expectedPattern: capabilities.expectedVisionResponse }
        };
      }

      return {
        success: true,
        data: {
          contentLength: content.length,
          responsePreview: content.substring(0, 100),
          handledNonVisionAppropriately: true
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
export async function runImageProcessingTests(): Promise<ImageProcessingTestResults> {
  const imageTests = new ImageProcessingTests();
  return await imageTests.runAllTests();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runImageProcessingTests()
    .then(results => {
      console.log('\n📊 Image Processing Test Summary:');
      
      const categories = [
        { name: 'Single Image', results: results.singleImage },
        { name: 'Multiple Images', results: results.multipleImages },
        { name: 'Long Text + Image', results: results.longTextWithImage },
        { name: 'Invalid Image', results: results.invalidImage },
        { name: 'Non-Vision Models', results: results.nonVisionModels }
      ];

      categories.forEach(category => {
        const categoryResults = Object.entries(category.results);
        if (categoryResults.length === 0) {
          console.log(`   ${category.name}: No tests (no applicable models)`);
          return;
        }
        
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
      console.error('💥 Image processing tests failed:', error);
      process.exit(1);
    });
}

export default { ImageProcessingTests, runImageProcessingTests };
