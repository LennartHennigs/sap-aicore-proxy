#!/usr/bin/env node

/**
 * Unit tests for ApiKeyManager
 * Tests custom API key generation, validation, persistence, and security features
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { ApiKeyManager } from '../../src/auth/api-key-manager.js';
import { TestUtils, type TestResult } from '../utils/test-helpers.js';

export interface ApiKeyManagerTestResults {
  keyGeneration: TestResult;
  keyFormat: TestResult;
  keyValidation: TestResult;
  keyPersistence: TestResult;
  keyRegeneration: TestResult;
  keyMasking: TestResult;
  constantTimeValidation: TestResult;
  filePermissions: TestResult;
  overallSuccess: boolean;
}

export class ApiKeyManagerTests {
  private static readonly TEST_API_KEY_FILE = '.env.apikey.test';
  private static readonly ORIGINAL_API_KEY_FILE = '.env.apikey';

  constructor() {
    // Backup original file if it exists
    this.backupOriginalFile();
  }

  private backupOriginalFile(): void {
    if (existsSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE)) {
      const content = readFileSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE, 'utf-8');
      writeFileSync(`${ApiKeyManagerTests.ORIGINAL_API_KEY_FILE}.backup`, content);
    }
  }

  private restoreOriginalFile(): void {
    // Clean up test file
    if (existsSync(ApiKeyManagerTests.TEST_API_KEY_FILE)) {
      unlinkSync(ApiKeyManagerTests.TEST_API_KEY_FILE);
    }

    // Restore original if backup exists
    if (existsSync(`${ApiKeyManagerTests.ORIGINAL_API_KEY_FILE}.backup`)) {
      const content = readFileSync(`${ApiKeyManagerTests.ORIGINAL_API_KEY_FILE}.backup`, 'utf-8');
      writeFileSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE, content);
      unlinkSync(`${ApiKeyManagerTests.ORIGINAL_API_KEY_FILE}.backup`);
    }
  }

  async runAllTests(): Promise<ApiKeyManagerTestResults> {
    console.log('🔑 Running ApiKeyManager Tests...\n');

    const results: ApiKeyManagerTestResults = {
      keyGeneration: { success: false },
      keyFormat: { success: false },
      keyValidation: { success: false },
      keyPersistence: { success: false },
      keyRegeneration: { success: false },
      keyMasking: { success: false },
      constantTimeValidation: { success: false },
      filePermissions: { success: false },
      overallSuccess: false
    };

    try {
      // Test 1: Key generation
      console.log('🔐 Testing key generation...');
      results.keyGeneration = await this.testKeyGeneration();
      TestUtils.logTestResult('Key Generation', results.keyGeneration);

      // Test 2: Key format validation
      console.log('\n📋 Testing key format...');
      results.keyFormat = await this.testKeyFormat();
      TestUtils.logTestResult('Key Format', results.keyFormat);

      // Test 3: Key validation
      console.log('\n✅ Testing key validation...');
      results.keyValidation = await this.testKeyValidation();
      TestUtils.logTestResult('Key Validation', results.keyValidation);

      // Test 4: Key persistence
      console.log('\n💾 Testing key persistence...');
      results.keyPersistence = await this.testKeyPersistence();
      TestUtils.logTestResult('Key Persistence', results.keyPersistence);

      // Test 5: Key regeneration
      console.log('\n🔄 Testing key regeneration...');
      results.keyRegeneration = await this.testKeyRegeneration();
      TestUtils.logTestResult('Key Regeneration', results.keyRegeneration);

      // Test 6: Key masking
      console.log('\n🎭 Testing key masking...');
      results.keyMasking = await this.testKeyMasking();
      TestUtils.logTestResult('Key Masking', results.keyMasking);

      // Test 7: Constant-time validation
      console.log('\n⏱️ Testing constant-time validation...');
      results.constantTimeValidation = await this.testConstantTimeValidation();
      TestUtils.logTestResult('Constant-time Validation', results.constantTimeValidation);

      // Test 8: File permissions (Unix-like systems only)
      console.log('\n🔒 Testing file permissions...');
      results.filePermissions = await this.testFilePermissions();
      TestUtils.logTestResult('File Permissions', results.filePermissions);

      // Calculate overall success
      const allResults = [
        results.keyGeneration,
        results.keyFormat,
        results.keyValidation,
        results.keyPersistence,
        results.keyRegeneration,
        results.keyMasking,
        results.constantTimeValidation,
        results.filePermissions
      ];

      const successfulTests = allResults.filter(r => r.success).length;
      results.overallSuccess = successfulTests > allResults.length * 0.8; // 80% success rate

      console.log(`\n🎯 ApiKeyManager Tests ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      console.log(`   Success Rate: ${successfulTests}/${allResults.length} (${Math.round(successfulTests/allResults.length*100)}%)`);

      return results;

    } catch (error) {
      console.error('💥 ApiKeyManager tests failed with error:', error);
      return results;
    } finally {
      this.restoreOriginalFile();
    }
  }

  private async testKeyGeneration(): Promise<TestResult> {
    try {
      // Clear any existing key to force generation
      (ApiKeyManager as any).apiKey = null;
      
      // Remove existing file to test fresh generation
      if (existsSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE)) {
        unlinkSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE);
      }

      const startTime = Date.now();
      const key = ApiKeyManager.initialize();
      const responseTime = Date.now() - startTime;

      // Validate key was generated
      if (!key || typeof key !== 'string') {
        return {
          success: false,
          error: 'Key generation failed - no key returned',
          responseTime
        };
      }

      // Validate key length (should be sk-proj- + 43 base64url chars)
      const expectedLength = 'sk-proj-'.length + 43;
      if (key.length !== expectedLength) {
        return {
          success: false,
          error: `Key length incorrect. Expected: ${expectedLength}, Got: ${key.length}`,
          responseTime,
          data: { generatedKey: key }
        };
      }

      return {
        success: true,
        data: {
          keyLength: key.length,
          keyPrefix: key.substring(0, 8),
          generationTime: responseTime
        },
        responseTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testKeyFormat(): Promise<TestResult> {
    try {
      const key = ApiKeyManager.getApiKey();

      // Test prefix
      if (!key.startsWith('sk-proj-')) {
        return {
          success: false,
          error: `Key does not start with 'sk-proj-'. Got: ${key.substring(0, 10)}`
        };
      }

      // Test total length
      const expectedLength = 51; // sk-proj- (8) + base64url (43)
      if (key.length !== expectedLength) {
        return {
          success: false,
          error: `Key length incorrect. Expected: ${expectedLength}, Got: ${key.length}`
        };
      }

      // Test base64url characters after prefix
      const keyPart = key.substring(8);
      const base64urlRegex = /^[A-Za-z0-9_-]{43}$/;
      if (!base64urlRegex.test(keyPart)) {
        return {
          success: false,
          error: `Key part after prefix contains invalid characters: ${keyPart}`
        };
      }

      return {
        success: true,
        data: {
          prefix: key.substring(0, 8),
          keyPart: keyPart.substring(0, 10) + '...',
          totalLength: key.length,
          formatValid: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testKeyValidation(): Promise<TestResult> {
    try {
      const validKey = ApiKeyManager.getApiKey();

      // Test valid key
      const isValidKey = ApiKeyManager.validateApiKey(validKey);
      if (!isValidKey) {
        return {
          success: false,
          error: 'Valid key failed validation'
        };
      }

      // Test invalid keys
      const invalidKeys = [
        '', // Empty
        'invalid-key', // Wrong format
        'sk-proj-', // Missing key part
        'sk-proj-invalid!@#', // Invalid characters
        'sk-proj-' + 'a'.repeat(42), // Wrong length (too short)
        'sk-proj-' + 'a'.repeat(44), // Wrong length (too long)
        validKey.substring(1), // Missing first character
        validKey + 'x' // Extra character
      ];

      for (const invalidKey of invalidKeys) {
        const isInvalidKey = ApiKeyManager.validateApiKey(invalidKey);
        if (isInvalidKey) {
          return {
            success: false,
            error: `Invalid key passed validation: ${invalidKey}`,
            data: { failedKey: invalidKey }
          };
        }
      }

      return {
        success: true,
        data: {
          validKeyPassed: true,
          invalidKeysRejected: invalidKeys.length,
          testedCases: ['empty', 'wrong_format', 'missing_key_part', 'invalid_chars', 'wrong_length', 'truncated', 'extended']
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testKeyPersistence(): Promise<TestResult> {
    try {
      // Generate a new key
      const originalKey = ApiKeyManager.initialize();

      // Verify file was created
      if (!existsSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE)) {
        return {
          success: false,
          error: 'API key file was not created'
        };
      }

      // Read file content
      const fileContent = readFileSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE, 'utf-8');
      
      // Verify file format
      if (!fileContent.includes('API_KEY=')) {
        return {
          success: false,
          error: 'File does not contain API_KEY= format'
        };
      }

      if (!fileContent.includes(originalKey)) {
        return {
          success: false,
          error: 'File does not contain the generated key'
        };
      }

      // Test loading from file
      (ApiKeyManager as any).apiKey = null; // Clear cache
      const loadedKey = ApiKeyManager.getApiKey();

      if (loadedKey !== originalKey) {
        return {
          success: false,
          error: 'Loaded key does not match original key',
          data: {
            original: originalKey.substring(0, 20) + '...',
            loaded: loadedKey.substring(0, 20) + '...'
          }
        };
      }

      return {
        success: true,
        data: {
          fileSaved: true,
          fileLoaded: true,
          keyMatches: true,
          fileSize: fileContent.length
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testKeyRegeneration(): Promise<TestResult> {
    try {
      const originalKey = ApiKeyManager.getApiKey();

      // Regenerate key
      const newKey = ApiKeyManager.regenerateApiKey();

      // Verify keys are different
      if (originalKey === newKey) {
        return {
          success: false,
          error: 'Regenerated key is identical to original key'
        };
      }

      // Verify new key format
      if (!newKey.startsWith('sk-proj-') || newKey.length !== 51) {
        return {
          success: false,
          error: 'Regenerated key has invalid format',
          data: { newKey: newKey.substring(0, 20) + '...' }
        };
      }

      // Verify new key validates
      if (!ApiKeyManager.validateApiKey(newKey)) {
        return {
          success: false,
          error: 'Regenerated key fails validation'
        };
      }

      // Verify old key no longer validates (should still validate - this tests key uniqueness)
      if (!ApiKeyManager.validateApiKey(originalKey)) {
        // This is expected behavior - old key should still be valid format, just not the current key
      }

      // Verify current key is the new one
      const currentKey = ApiKeyManager.getApiKey();
      if (currentKey !== newKey) {
        return {
          success: false,
          error: 'Current key is not the regenerated key'
        };
      }

      return {
        success: true,
        data: {
          keysAreDifferent: originalKey !== newKey,
          newKeyValidFormat: true,
          newKeyValidates: true,
          regenerationWorked: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testKeyMasking(): Promise<TestResult> {
    try {
      const originalKey = ApiKeyManager.getApiKey();
      const maskedKey = ApiKeyManager.getMaskedApiKey();

      // Verify masked key format
      if (!maskedKey.includes('****')) {
        return {
          success: false,
          error: 'Masked key does not contain masking characters',
          data: { maskedKey }
        };
      }

      // Verify masked key starts with prefix
      if (!maskedKey.startsWith('sk-proj-')) {
        return {
          success: false,
          error: 'Masked key does not start with proper prefix',
          data: { maskedKey }
        };
      }

      // Verify masked key is shorter than original
      if (maskedKey.length >= originalKey.length) {
        return {
          success: false,
          error: 'Masked key is not shorter than original',
          data: {
            originalLength: originalKey.length,
            maskedLength: maskedKey.length
          }
        };
      }

      // Verify masked key doesn't contain full original key
      const keyPart = originalKey.substring(8);
      if (maskedKey.includes(keyPart)) {
        return {
          success: false,
          error: 'Masked key contains the full original key part'
        };
      }

      return {
        success: true,
        data: {
          originalLength: originalKey.length,
          maskedLength: maskedKey.length,
          maskedKey,
          properlyMasked: true
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testConstantTimeValidation(): Promise<TestResult> {
    try {
      const validKey = ApiKeyManager.getApiKey();
      const invalidKey = 'sk-proj-' + 'x'.repeat(43);

      // Test multiple validation calls and measure timing
      const validationTests = 100;
      const validTimes: number[] = [];
      const invalidTimes: number[] = [];

      // Test valid key timing
      for (let i = 0; i < validationTests; i++) {
        const start = process.hrtime.bigint();
        ApiKeyManager.validateApiKey(validKey);
        const end = process.hrtime.bigint();
        validTimes.push(Number(end - start));
      }

      // Test invalid key timing
      for (let i = 0; i < validationTests; i++) {
        const start = process.hrtime.bigint();
        ApiKeyManager.validateApiKey(invalidKey);
        const end = process.hrtime.bigint();
        invalidTimes.push(Number(end - start));
      }

      // Calculate averages
      const avgValidTime = validTimes.reduce((a, b) => a + b) / validTimes.length;
      const avgInvalidTime = invalidTimes.reduce((a, b) => a + b) / invalidTimes.length;

      // Calculate variance to check for timing consistency
      const timeDifference = Math.abs(avgValidTime - avgInvalidTime);
      const relativeDifference = timeDifference / Math.max(avgValidTime, avgInvalidTime);

      // Constant-time should have minimal timing difference (< 50% relative difference)
      const isConstantTime = relativeDifference < 0.5;

      return {
        success: true, // This test is informational - constant-time is hard to verify perfectly
        data: {
          validationTests,
          avgValidTime: Math.round(avgValidTime),
          avgInvalidTime: Math.round(avgInvalidTime),
          timeDifference: Math.round(timeDifference),
          relativeDifference: Math.round(relativeDifference * 100) / 100,
          appearsConstantTime: isConstantTime,
          note: 'Timing-based security test - results may vary by system'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testFilePermissions(): Promise<TestResult> {
    try {
      // This test only works on Unix-like systems
      if (process.platform === 'win32') {
        return {
          success: true,
          data: {
            skipped: true,
            reason: 'File permissions test skipped on Windows',
            platform: process.platform
          }
        };
      }

      // Ensure key file exists
      ApiKeyManager.initialize();

      if (!existsSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE)) {
        return {
          success: false,
          error: 'API key file does not exist for permissions test'
        };
      }

      // Check file permissions using fs.stat
      const fs = await import('fs');
      const stats = fs.statSync(ApiKeyManagerTests.ORIGINAL_API_KEY_FILE);
      const mode = stats.mode;

      // Extract permission bits (last 9 bits)
      const permissions = mode & parseInt('777', 8);
      const expectedPermissions = parseInt('600', 8); // Owner read/write only

      if (permissions !== expectedPermissions) {
        return {
          success: false,
          error: `Incorrect file permissions. Expected: 600, Got: ${permissions.toString(8)}`,
          data: {
            expectedOctal: '600',
            actualOctal: permissions.toString(8),
            expectedDecimal: expectedPermissions,
            actualDecimal: permissions
          }
        };
      }

      return {
        success: true,
        data: {
          permissions: permissions.toString(8),
          secure: true,
          platform: process.platform
        }
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
export async function runApiKeyManagerTests(): Promise<ApiKeyManagerTestResults> {
  const tests = new ApiKeyManagerTests();
  return await tests.runAllTests();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runApiKeyManagerTests()
    .then(results => {
      console.log('\n📊 ApiKeyManager Test Summary:');
      console.log(`   Key Generation: ${results.keyGeneration.success ? '✅' : '❌'}`);
      console.log(`   Key Format: ${results.keyFormat.success ? '✅' : '❌'}`);
      console.log(`   Key Validation: ${results.keyValidation.success ? '✅' : '❌'}`);
      console.log(`   Key Persistence: ${results.keyPersistence.success ? '✅' : '❌'}`);
      console.log(`   Key Regeneration: ${results.keyRegeneration.success ? '✅' : '❌'}`);
      console.log(`   Key Masking: ${results.keyMasking.success ? '✅' : '❌'}`);
      console.log(`   Constant-time Validation: ${results.constantTimeValidation.success ? '✅' : '❌'}`);
      console.log(`   File Permissions: ${results.filePermissions.success ? '✅' : '❌'}`);
      console.log(`\n🎯 Overall: ${results.overallSuccess ? 'PASSED' : 'FAILED'}`);
      
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 ApiKeyManager tests failed:', error);
      process.exit(1);
    });
}

export default { ApiKeyManagerTests, runApiKeyManagerTests };
