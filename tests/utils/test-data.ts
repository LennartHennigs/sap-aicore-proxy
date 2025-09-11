#!/usr/bin/env node

/**
 * Test data for SAP AI Core proxy testing
 * Contains test images, messages, and expected responses
 */

// Test images in base64 format
export const TEST_IMAGES = {
  // 1x1 red pixel
  RED_PIXEL: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  
  // 1x1 blue pixel  
  BLUE_PIXEL: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
  
  // 1x1 yellow pixel
  YELLOW_PIXEL: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  
  // 1x1 green pixel
  GREEN_PIXEL: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkZGRkAAAABgABaADcgwAAAABJRU5ErkJggg==',
  
  // 2x2 checkerboard pattern
  CHECKERBOARD: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNkYGBgZGRkZGBgYGRkZAAABgABaADcgwAAAABJRU5ErkJggg==',
  
  // Invalid/corrupted base64 (for error testing)
  INVALID: 'invalid-base64-data-for-testing-errors'
};

// Test messages for different scenarios
export const TEST_MESSAGES = {
  // Simple text messages
  SIMPLE_TEXT: [
    {
      role: 'user' as const,
      content: 'Hello, how are you?'
    }
  ],
  
  GREETING: [
    {
      role: 'user' as const,
      content: 'Hi there! Please respond with a brief greeting.'
    }
  ],
  
  // System + user messages
  SYSTEM_PROMPT: [
    {
      role: 'system' as const,
      content: 'You are a helpful assistant. Always respond concisely.'
    },
    {
      role: 'user' as const,
      content: 'What is 2+2?'
    }
  ],
  
  // Multi-turn conversation
  CONVERSATION: [
    {
      role: 'user' as const,
      content: 'What is the capital of France?'
    },
    {
      role: 'assistant' as const,
      content: 'The capital of France is Paris.'
    },
    {
      role: 'user' as const,
      content: 'What is its population?'
    }
  ],
  
  // Vision messages
  VISION_RED_PIXEL: [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'What color is this pixel?'
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/png;base64,${TEST_IMAGES.RED_PIXEL}`
          }
        }
      ]
    }
  ],
  
  VISION_YELLOW_PIXEL: [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'What color do you see in this image?'
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/png;base64,${TEST_IMAGES.YELLOW_PIXEL}`
          }
        }
      ]
    }
  ],
  
  VISION_MULTIPLE_IMAGES: [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Compare these two images and tell me what colors you see.'
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/png;base64,${TEST_IMAGES.RED_PIXEL}`
          }
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/png;base64,${TEST_IMAGES.BLUE_PIXEL}`
          }
        }
      ]
    }
  ],
  
  // Edge cases
  EMPTY_MESSAGE: [
    {
      role: 'user' as const,
      content: ''
    }
  ],
  
  LONG_TEXT: [
    {
      role: 'user' as const,
      content: 'This is a very long text message that is designed to test how the models handle longer inputs. '.repeat(50) + 'What is your response?'
    }
  ],
  
  LONG_TEXT_WITH_IMAGE: [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'This is a very long text message with an image. '.repeat(20) + 'What color is in the image?'
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/png;base64,${TEST_IMAGES.YELLOW_PIXEL}`
          }
        }
      ]
    }
  ],
  
  INVALID_IMAGE: [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: 'What do you see in this image?'
        },
        {
          type: 'image_url' as const,
          image_url: {
            url: `data:image/png;base64,${TEST_IMAGES.INVALID}`
          }
        }
      ]
    }
  ],
  
  // Special characters and Unicode
  UNICODE_TEXT: [
    {
      role: 'user' as const,
      content: 'Hello! 你好! Bonjour! 🌟 How do you handle Unicode characters? 🚀'
    }
  ]
};

// Expected model capabilities
export const MODEL_CAPABILITIES = {
  'gpt-5-nano': {
    supportsVision: true,
    supportsStreaming: true,
    apiType: 'provider',
    expectedVisionResponse: /red|blue|yellow|green|color/i
  },
  'anthropic--claude-4-sonnet': {
    supportsVision: true,
    supportsStreaming: false,
    apiType: 'direct',
    expectedVisionResponse: /red|blue|yellow|green|color|pixel|image/i
  },
  'gemini-2.5-flash': {
    supportsVision: false, // Disabled in current config
    supportsStreaming: false,
    apiType: 'direct',
    expectedVisionResponse: /cannot|don't|unable|text-based|disabled/i
  }
};

// Test configuration
export const TEST_CONFIG = {
  PROXY_URL: 'http://localhost:3001',
  API_KEY: 'test-key',
  TIMEOUT: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  
  // Performance thresholds
  PERFORMANCE_THRESHOLDS: {
    RESPONSE_TIME_MS: 10000, // 10 seconds max
    CONCURRENT_REQUESTS: 5,
    MEMORY_USAGE_MB: 500
  },
  
  // Expected response formats
  OPENAI_RESPONSE_SCHEMA: {
    required: ['id', 'object', 'created', 'model', 'choices'],
    choices_required: ['index', 'message', 'finish_reason'],
    message_required: ['role', 'content']
  }
};

// Common test scenarios
export const TEST_SCENARIOS = {
  CONNECTION: 'connection',
  TEXT_PROCESSING: 'text_processing',
  IMAGE_PROCESSING: 'image_processing',
  RESPONSE_VALIDATION: 'response_validation',
  ERROR_HANDLING: 'error_handling',
  PERFORMANCE: 'performance'
};

export default {
  TEST_IMAGES,
  TEST_MESSAGES,
  MODEL_CAPABILITIES,
  TEST_CONFIG,
  TEST_SCENARIOS
};
