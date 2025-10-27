#!/usr/bin/env ts-node

/**
 * Quick test to verify the response validation fix is working
 * This test simulates the "Invalid API Response" scenario and verifies it's handled
 */

import { responseValidator } from '../src/utils/response-validator.js';
import { SecureLogger } from '../src/utils/secure-logger.js';

// Mock empty/invalid responses that would cause "Invalid API Response" errors
const testCases = [
  {
    name: 'Empty response',
    response: null,
    modelName: 'anthropic--claude-4-sonnet'
  },
  {
    name: 'Empty text response',
    response: { success: true, text: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    modelName: 'anthropic--claude-4-sonnet'
  },
  {
    name: 'Whitespace-only response',
    response: { success: true, text: '   \n\t   ', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    modelName: 'anthropic--claude-4-sonnet'
  },
  {
    name: 'Malformed JSON response',
    response: '{"text": "Hello world",}',
    modelName: 'anthropic--claude-4-sonnet'
  },
  {
    name: 'Reasoning-only response',
    response: { success: true, text: '<thinking>I need to analyze this request</thinking>', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    modelName: 'anthropic--claude-4-sonnet'
  },
  {
    name: 'Missing usage info',
    response: { success: true, text: 'Valid response text' },
    modelName: 'anthropic--claude-4-sonnet'
  }
];

async function runValidationTests() {
  console.log('🧪 Running Response Validation Fix Tests\n');
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.name}`);
      
      const validation = responseValidator.validateAndCorrectResponse(
        testCase.response, 
        testCase.modelName, 
        'Test prompt'
      );
      
      if (validation.isValid && !validation.corrected) {
        console.log('  ✅ Response was already valid');
        passedTests++;
      } else if (!validation.isValid && validation.corrected && validation.correctedResponse) {
        console.log('  ✅ Response was corrected successfully');
        console.log(`  📝 Issues fixed: ${validation.issues.join(', ')}`);
        console.log(`  📄 Corrected text: "${validation.correctedResponse.text.substring(0, 100)}${validation.correctedResponse.text.length > 100 ? '...' : ''}"`);
        passedTests++;
      } else {
        console.log('  ❌ Test failed - validation did not work as expected');
        console.log(`  📊 Valid: ${validation.isValid}, Corrected: ${validation.corrected}, Issues: ${validation.issues.length}`);
      }
      
    } catch (error) {
      console.log('  ❌ Test failed with error:', error);
    }
    
    console.log('');
  }
  
  // Test streaming chunk validation
  console.log('Testing: Stream chunk validation');
  try {
    const invalidChunk = { delta: null, finished: false };
    const chunkValidation = responseValidator.validateStreamChunk(invalidChunk, 'test-model');
    
    if (chunkValidation.corrected && chunkValidation.correctedChunk) {
      console.log('  ✅ Stream chunk was corrected successfully');
      console.log(`  📝 Issues fixed: ${chunkValidation.issues.join(', ')}`);
      passedTests++;
    } else {
      console.log('  ❌ Stream chunk validation failed');
    }
    totalTests++;
  } catch (error) {
    console.log('  ❌ Stream chunk test failed with error:', error);
    totalTests++;
  }
  
  console.log('');
  console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! The response validation fix is working correctly.');
    console.log('');
    console.log('✨ The fix should now prevent "Invalid API Response" errors by:');
    console.log('   • Validating responses in OpenAI handler (NEW)');
    console.log('   • Applying proxy-level validation safety net (NEW)');
    console.log('   • Generating fallback responses for empty/invalid content');
    console.log('   • Fixing malformed JSON and reasoning-only responses');
    console.log('   • Ensuring proper usage information is always present');
    console.log('');
    console.log('📋 Response analysis logging is enabled and should now populate logs in:');
    console.log('   ./logs/response-analysis.jsonl');
  } else {
    console.log('⚠️  Some tests failed. The fix may need additional work.');
    process.exit(1);
  }
}

// Run the tests
runValidationTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
