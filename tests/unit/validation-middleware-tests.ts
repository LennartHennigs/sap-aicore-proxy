#!/usr/bin/env node

/**
 * Unit tests for input validation middleware
 * Tests request validation, sanitization, and security boundaries
 */

import express from 'express';
import request from 'supertest';
import { 
  validateChatCompletion, 
  handleValidationErrors, 
  sanitizeInput, 
  validateContentLength 
} from '../../src/middleware/validation.js';

interface TestResult {
  success: boolean;
  error?: string;
  data?: any;
}

class ValidationMiddlewareTests {
  private app: express.Application;
  private originalEnv: { [key: string]: string | undefined } = {};

  constructor() {
    this.setupTestApp();
    this.saveEnvironment();
  }

  private setupTestApp(): void {
    this.app = express();
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(sanitizeInput);
    this.app.use(validateContentLength);
    
    // Test endpoint with full validation
    this.app.post('/test/chat-completion', 
      validateChatCompletion,
      handleValidationErrors,
      (req, res) => {
        res.json({ success: true, body: req.body });
      }
    );

    // Test endpoint for sanitization only
    this.app.post('/test/sanitize', 
      sanitizeInput,
      (req, res) => {
        res.json({ success: true, sanitized: req.body });
      }
    );

    // Test endpoint for content length validation
    this.app.post('/test/content-length',
      validateContentLength,
      (req, res) => {
        res.json({ success: true });
      }
    );
  }

  private saveEnvironment(): void {
    this.originalEnv = {
      MAX_MESSAGES_PER_REQUEST: process.env.MAX_MESSAGES_PER_REQUEST,
      MAX_CONTENT_LENGTH: process.env.MAX_CONTENT_LENGTH,
      MAX_REQUEST_SIZE: process.env.MAX_REQUEST_SIZE
    };
  }

  private restoreEnvironment(): void {
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }

  // Test 1: Valid chat completion request
  async testValidChatCompletionRequest(): Promise<TestResult> {
    try {
      const validRequest = {
        model: 'gpt-5-nano',
        messages: [
          { role: 'user', content: 'Hello, how are you?' }
        ],
        max_tokens: 100,
        temperature: 0.7
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(validRequest)
        .expect(200);

      if (!response.body.success) {
        return {
          success: false,
          error: 'Valid request was rejected'
        };
      }

      return { 
        success: true, 
        data: { statusCode: response.status, body: response.body } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 2: Invalid model validation
  async testInvalidModelValidation(): Promise<TestResult> {
    try {
      const invalidRequest = {
        model: 'invalid-model-xyz',
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(invalidRequest)
        .expect(400);

      if (response.body.error && response.body.error.type === 'validation_error') {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Invalid model was not properly rejected'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 3: Too many messages validation
  async testTooManyMessagesValidation(): Promise<TestResult> {
    try {
      // Set a low limit for testing
      process.env.MAX_MESSAGES_PER_REQUEST = '3';
      
      const tooManyMessages = {
        model: 'gpt-5-nano',
        messages: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
          { role: 'assistant', content: 'Response 2' },
          { role: 'user', content: 'Message 3 - This exceeds limit' }
        ]
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(tooManyMessages)
        .expect(400);

      if (response.body.error && 
          response.body.error.details.some((detail: string) => 
            detail.includes('Too many messages'))) {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Too many messages validation failed'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 4: Content length validation
  async testContentLengthValidation(): Promise<TestResult> {
    try {
      // Set a very low limit for testing
      process.env.MAX_CONTENT_LENGTH = '20';
      
      const longContentRequest = {
        model: 'gpt-5-nano',
        messages: [
          { 
            role: 'user', 
            content: 'This is a very long message that definitely exceeds the maximum content length limit set for testing purposes'
          }
        ]
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(longContentRequest)
        .expect(400);

      if (response.body.error && 
          response.body.error.details.some((detail: string) => 
            detail.includes('Message content too long'))) {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Content length validation failed'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 5: Temperature validation
  async testTemperatureValidation(): Promise<TestResult> {
    try {
      const invalidTemperatureRequest = {
        model: 'gpt-5-nano',
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        temperature: 3.5 // Invalid, should be between 0 and 2
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(invalidTemperatureRequest)
        .expect(400);

      if (response.body.error && 
          response.body.error.details.some((detail: string) => 
            detail.includes('temperature must be between 0 and 2'))) {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Temperature validation failed'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 6: Message role validation
  async testMessageRoleValidation(): Promise<TestResult> {
    try {
      const invalidRoleRequest = {
        model: 'gpt-5-nano',
        messages: [
          { role: 'invalid-role', content: 'Hello' }
        ]
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(invalidRoleRequest)
        .expect(400);

      if (response.body.error && 
          response.body.error.details.some((detail: string) => 
            detail.includes('Invalid message role'))) {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Message role validation failed'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 7: Input sanitization (null bytes removal)
  async testInputSanitization(): Promise<TestResult> {
    try {
      const maliciousInput = {
        model: 'gpt-5-nano\0malicious',
        messages: [
          { role: 'user', content: 'Hello\0world' }
        ],
        nested: {
          field: 'value\0with\0nulls'
        }
      };

      const response = await request(this.app)
        .post('/test/sanitize')
        .send(maliciousInput)
        .expect(200);

      const sanitized = response.body.sanitized;

      // Check that null bytes were removed
      if (sanitized.model.includes('\0') || 
          sanitized.messages[0].content.includes('\0') ||
          sanitized.nested.field.includes('\0')) {
        return {
          success: false,
          error: 'Input sanitization failed: null bytes not removed'
        };
      }

      // Check that content was preserved (minus null bytes)
      if (sanitized.model !== 'gpt-5-nanomalicious' ||
          sanitized.messages[0].content !== 'Helloworld' ||
          sanitized.nested.field !== 'valuewithnulls') {
        return {
          success: false,
          error: 'Input sanitization modified content incorrectly'
        };
      }

      return { 
        success: true, 
        data: { sanitized } 
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 8: Content-Length header validation
  async testContentLengthHeaderValidation(): Promise<TestResult> {
    try {
      // Set a very low limit for testing
      process.env.MAX_REQUEST_SIZE = '100';

      const largeRequest = {
        model: 'gpt-5-nano',
        messages: [
          { 
            role: 'user', 
            content: 'This is a message that when serialized as JSON will be much larger than our test limit of 100 bytes'
          }
        ]
      };

      const response = await request(this.app)
        .post('/test/content-length')
        .send(largeRequest)
        .expect(413);

      if (response.body.error && response.body.error.type === 'payload_too_large_error') {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Content-Length validation failed'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 9: Vision content validation (requires non-vision model)
  async testVisionContentValidation(): Promise<TestResult> {
    try {
      const visionRequest = {
        model: 'gemini-2.5-flash', // Assuming this doesn't support vision
        messages: [
          { 
            role: 'user', 
            content: [
              { type: 'text', text: 'What do you see in this image?' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' } }
            ]
          }
        ]
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(visionRequest)
        .expect(400);

      if (response.body.error && 
          response.body.error.details.some((detail: string) => 
            detail.includes('Images not supported'))) {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Vision content validation failed or model supports vision'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Test 10: Empty content validation
  async testEmptyContentValidation(): Promise<TestResult> {
    try {
      const emptyContentRequest = {
        model: 'gpt-5-nano',
        messages: [
          { role: 'user', content: '   ' } // Only whitespace
        ]
      };

      const response = await request(this.app)
        .post('/test/chat-completion')
        .send(emptyContentRequest)
        .expect(400);

      if (response.body.error && 
          response.body.error.details.some((detail: string) => 
            detail.includes('Message content cannot be empty'))) {
        return { 
          success: true, 
          data: { error: response.body.error } 
        };
      }

      return {
        success: false,
        error: 'Empty content validation failed'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async runAllTests(): Promise<void> {
    console.log('\n🔒 Running Input Validation Middleware Tests...\n');

    const tests = [
      { name: 'Valid chat completion request', test: () => this.testValidChatCompletionRequest() },
      { name: 'Invalid model validation', test: () => this.testInvalidModelValidation() },
      { name: 'Too many messages validation', test: () => this.testTooManyMessagesValidation() },
      { name: 'Content length validation', test: () => this.testContentLengthValidation() },
      { name: 'Temperature validation', test: () => this.testTemperatureValidation() },
      { name: 'Message role validation', test: () => this.testMessageRoleValidation() },
      { name: 'Input sanitization', test: () => this.testInputSanitization() },
      { name: 'Content-Length header validation', test: () => this.testContentLengthHeaderValidation() },
      { name: 'Vision content validation', test: () => this.testVisionContentValidation() },
      { name: 'Empty content validation', test: () => this.testEmptyContentValidation() }
    ];

    let passed = 0;
    let failed = 0;

    for (const { name, test } of tests) {
      try {
        const result = await test();
        const status = result.success ? '✅' : '❌';
        console.log(`${status} ${name}`);
        
        if (!result.success) {
          console.log(`   Error: ${result.error}`);
          failed++;
        } else {
          passed++;
          if (result.data) {
            console.log(`   Data: ${JSON.stringify(result.data, null, 2).slice(0, 200)}${JSON.stringify(result.data).length > 200 ? '...' : ''}`);
          }
        }
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    // Restore environment
    this.restoreEnvironment();

    console.log(`\n📊 Input Validation Test Results: ${passed} passed, ${failed} failed\n`);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new ValidationMiddlewareTests();
  tests.runAllTests().catch(console.error);
}

export { ValidationMiddlewareTests };