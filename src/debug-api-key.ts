#!/usr/bin/env node

import { ApiKeyManager } from './auth/api-key-manager.js';

console.log('🔍 API Key Debug Information');
console.log('=' .repeat(50));

try {
  // Initialize the API key system
  const apiKey = ApiKeyManager.getApiKey();
  console.log('✅ API Key initialized successfully');
  console.log(`   Full key: ${apiKey}`);
  console.log(`   Masked key: ${ApiKeyManager.getMaskedApiKey()}`);
  console.log(`   Key length: ${apiKey.length}`);
  console.log(`   Key prefix: ${apiKey.substring(0, 8)}`);
  
  // Test validation against itself
  console.log('\n🔒 Testing API Key Validation');
  const isValid = ApiKeyManager.validateApiKey(apiKey);
  console.log(`   Self-validation: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
  
  // Test with the key that was shown in the server startup
  const serverKey = 'sk-proj-KEiBe1MO4JWCQLKfwZFO06G5OPlJR0rSxgqGgF6A9hI';
  const serverKeyValid = ApiKeyManager.validateApiKey(serverKey);
  console.log(`   Server key validation: ${serverKeyValid ? '✅ PASS' : '❌ FAIL'}`);
  
  // Compare the keys
  console.log('\n🔄 Key Comparison');
  console.log(`   Generated key: ${apiKey}`);
  console.log(`   Server key:    ${serverKey}`);
  console.log(`   Keys match: ${apiKey === serverKey ? '✅ YES' : '❌ NO'}`);
  
  // Test format validation
  console.log('\n📝 Format Validation');
  console.log(`   Has correct prefix: ${apiKey.startsWith('sk-proj-') ? '✅ YES' : '❌ NO'}`);
  console.log(`   Expected length: 51 characters`);
  console.log(`   Actual length: ${apiKey.length} characters`);
  
} catch (error) {
  console.error('❌ Error during API key debug:');
  console.error(error);
}
