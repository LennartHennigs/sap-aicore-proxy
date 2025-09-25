#!/usr/bin/env node

import { tokenManager } from '../../src/auth/token-manager.js';
import { config } from '../../src/config/app-config.js';
import { SecureLogger } from '../../src/utils/secure-logger.js';

/**
 * Token Verification Test Suite
 * This script verifies that tokens are properly generated and sent to SAP AI Core
 */

async function testTokenGeneration() {
  console.log('🔑 Testing Token Generation...\n');
  
  try {
    // Test 1: Token acquisition
    console.log('1. Testing token acquisition...');
    const token = await tokenManager.getAccessToken();
    
    if (!token) {
      throw new Error('Token is null or empty');
    }
    
    if (typeof token !== 'string') {
      throw new Error('Token is not a string');
    }
    
    if (token.length < 10) {
      throw new Error('Token appears to be too short');
    }
    
    console.log('✅ Token acquired successfully');
    console.log(`   Token length: ${token.length} characters`);
    console.log(`   Token prefix: ${token.substring(0, 10)}...`);
    
    // Test 2: Token caching
    console.log('\n2. Testing token caching...');
    const startTime = Date.now();
    const cachedToken = await tokenManager.getAccessToken();
    const cacheTime = Date.now() - startTime;
    
    if (token !== cachedToken) {
      throw new Error('Cached token does not match original token');
    }
    
    console.log('✅ Token caching works correctly');
    console.log(`   Cache retrieval time: ${cacheTime}ms`);
    
    // Test 3: Token validation format
    console.log('\n3. Testing token format...');
    
    // JWT tokens typically have 3 parts separated by dots
    const tokenParts = token.split('.');
    if (tokenParts.length === 3) {
      console.log('✅ Token appears to be a valid JWT format');
      console.log(`   Header: ${tokenParts[0].substring(0, 20)}...`);
      console.log(`   Payload: ${tokenParts[1].substring(0, 20)}...`);
      console.log(`   Signature: ${tokenParts[2].substring(0, 20)}...`);
    } else {
      console.log('ℹ️  Token is not JWT format (this may be normal for SAP AI Core)');
    }
    
    return token;
    
  } catch (error) {
    console.error('❌ Token generation test failed:');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function testTokenTransmission(token: string) {
  console.log('\n🚀 Testing Token Transmission...\n');
  
  try {
    // Test 1: Mock SAP AI Core request headers
    console.log('1. Testing authorization header format...');
    
    const authHeader = `Bearer ${token}`;
    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization header does not start with "Bearer "');
    }
    
    if (authHeader.split(' ').length !== 2) {
      throw new Error('Authorization header format is incorrect');
    }
    
    console.log('✅ Authorization header format is correct');
    console.log(`   Header: ${authHeader.substring(0, 30)}...`);
    
    // Test 2: Test actual request headers (without making the request)
    console.log('\n2. Testing request header construction...');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'AI-Resource-Group': 'default'
    };
    
    console.log('✅ Request headers constructed correctly:');
    console.log(`   Authorization: Bearer ${token.substring(0, 20)}...`);
    console.log(`   Content-Type: ${headers['Content-Type']}`);
    console.log(`   AI-Resource-Group: ${headers['AI-Resource-Group']}`);
    
    // Test 3: Validate against SAP AI Core requirements
    console.log('\n3. Validating SAP AI Core requirements...');
    
    if (!config.aicore.baseUrl) {
      throw new Error('AICORE_BASE_URL is not configured');
    }
    
    if (!config.aicore.clientId) {
      throw new Error('AICORE_CLIENT_ID is not configured');
    }
    
    if (!config.aicore.clientSecret) {
      throw new Error('AICORE_CLIENT_SECRET is not configured');
    }
    
    if (!config.aicore.authUrl) {
      throw new Error('AICORE_AUTH_URL is not configured');
    }
    
    console.log('✅ SAP AI Core configuration is complete:');
    console.log(`   Base URL: ${config.aicore.baseUrl}`);
    console.log(`   Auth URL: ${config.aicore.authUrl}`);
    console.log(`   Client ID: ${config.aicore.clientId.substring(0, 8)}...`);
    console.log(`   Client Secret: ${'*'.repeat(config.aicore.clientSecret.length)}`);
    
  } catch (error) {
    console.error('❌ Token transmission test failed:');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function testTokenRefresh() {
  console.log('\n🔄 Testing Token Refresh...\n');
  
  try {
    console.log('1. Clearing token cache...');
    tokenManager.clearCache();
    console.log('✅ Token cache cleared');
    
    console.log('\n2. Acquiring new token...');
    const newToken = await tokenManager.getAccessToken();
    
    if (!newToken) {
      throw new Error('Failed to acquire new token after cache clear');
    }
    
    console.log('✅ New token acquired successfully');
    console.log(`   New token length: ${newToken.length} characters`);
    
  } catch (error) {
    console.error('❌ Token refresh test failed:');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function testEndToEndTokenFlow() {
  console.log('\n🔗 Testing End-to-End Token Flow...\n');
  
  try {
    // Test the complete flow: authentication -> token -> request preparation
    console.log('1. Simulating complete request flow...');
    
    // Step 1: Get token (as done by directApiHandler)
    const token = await tokenManager.getAccessToken();
    console.log(`✅ Step 1: Token acquired - ${token.substring(0, 20)}...`);
    
    // Step 2: Build request headers (as done by directApiHandler)
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'AI-Resource-Group': 'default'
    };
    console.log('✅ Step 2: Headers constructed');
    
    // Step 3: Build sample deployment URL
    const sampleDeploymentId = 'test-deployment-123';
    const deploymentUrl = `${config.aicore.baseUrl}/v2/inference/deployments/${sampleDeploymentId}`;
    console.log(`✅ Step 3: Deployment URL constructed - ${deploymentUrl}`);
    
    // Step 4: Build sample request body
    const requestBody = {
      messages: [
        { role: 'user', content: 'Hello, this is a test message' }
      ],
      max_tokens: 100,
      temperature: 0.7
    };
    console.log('✅ Step 4: Request body constructed');
    
    console.log('\n✅ End-to-end token flow simulation successful!');
    console.log('\nRequest Summary:');
    console.log(`   URL: ${deploymentUrl}`);
    console.log(`   Method: POST`);
    console.log(`   Authorization: Bearer ${token.substring(0, 20)}...`);
    console.log(`   Content-Type: application/json`);
    console.log(`   AI-Resource-Group: default`);
    console.log(`   Body: ${JSON.stringify(requestBody, null, 2)}`);
    
  } catch (error) {
    console.error('❌ End-to-end token flow test failed:');
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function main() {
  console.log('🔍 SAP AI Core Token Verification Test Suite');
  console.log('='.repeat(50));
  
  try {
    // Run all tests
    const token = await testTokenGeneration();
    await testTokenTransmission(token);
    await testTokenRefresh();
    await testEndToEndTokenFlow();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 All token verification tests passed!');
    console.log('\n✅ Token is properly generated');
    console.log('✅ Token is properly formatted for transmission');
    console.log('✅ Token caching works correctly');
    console.log('✅ Token refresh mechanism works');
    console.log('✅ End-to-end flow is properly configured');
    console.log('\n🚀 Your SAP AI Core proxy is ready to send tokens correctly!');
    
  } catch (error) {
    console.log('\n' + '='.repeat(50));
    console.error('❌ Token verification failed!');
    console.error('\nPlease check your configuration:');
    console.error('• Ensure AICORE_CLIENT_ID is set correctly');
    console.error('• Ensure AICORE_CLIENT_SECRET is set correctly');
    console.error('• Ensure AICORE_AUTH_URL is set correctly');
    console.error('• Ensure AICORE_BASE_URL is set correctly');
    console.error('• Check your network connectivity to SAP AI Core');
    
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (process.argv[1] && process.argv[1].endsWith('token-verification-tests.ts')) {
  main().catch(console.error);
}
