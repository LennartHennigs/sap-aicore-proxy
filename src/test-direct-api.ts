#!/usr/bin/env node

// Simple test using built-in fetch and process.env

interface DirectApiTestResult {
  success: boolean;
  data?: any;
  error?: string;
}

async function getAccessToken(): Promise<string> {
  const authUrl = process.env.AICORE_AUTH_URL;
  const clientId = process.env.AICORE_CLIENT_ID;
  const clientSecret = process.env.AICORE_CLIENT_SECRET;

  if (!authUrl || !clientId || !clientSecret) {
    throw new Error('Missing required auth environment variables');
  }

  const response = await fetch(`${authUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.access_token;
}

async function testDirectVisionAPI(): Promise<DirectApiTestResult> {
  try {
    console.log('🔑 Getting access token...');
    const token = await getAccessToken();
    console.log('✅ Authentication successful');

    const baseUrl = process.env.AICORE_BASE_URL;
    const deploymentId = 'd0004379cc65d2ad'; // GPT-5 nano deployment ID
    
    if (!baseUrl) {
      throw new Error('Missing AICORE_BASE_URL');
    }

    // Test the alternative /invoke format with inputText and inputImage
    const url = `${baseUrl}/v2/inference/deployments/${deploymentId}/invoke`;
    
    const payload = {
      inputText: "What color is this pixel?",
      inputImage: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      embeddingConfig: { 
        outputEmbeddingLength: 256
      }
    };

    console.log('🌐 Making direct API call...');
    console.log('📋 Testing vision API with sample data');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'AI-Resource-Group': 'default',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    console.log('📊 Response status:', response.status);

    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText}`
      };
    }

    const data = JSON.parse(responseText);
    return {
      success: true,
      data
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  console.log('🧪 Testing Direct SAP AI Core Vision API...\n');
  
  const result = await testDirectVisionAPI();
  
  if (result.success) {
    console.log('\n✅ SUCCESS! Direct API call worked:');
    console.log(JSON.stringify(result.data, null, 2));
    
    const response = result.data?.choices?.[0]?.message?.content;
    if (response) {
      console.log('\n🤖 Model Response:', response);
    }
  } else {
    console.log('\n❌ FAILED! Direct API call failed:');
    console.log(result.error);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testDirectVisionAPI };
