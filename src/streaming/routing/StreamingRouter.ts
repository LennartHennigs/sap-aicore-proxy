import { streamingDetectionService, type StreamingCapability, type DirectApiConfig } from '../detection/StreamingDetectionService.js';
import { anthropicDirectHandler, AnthropicDirectHandler } from '../direct-apis/AnthropicDirectHandler.js';
import { geminiDirectHandler, GeminiDirectHandler } from '../direct-apis/GeminiDirectHandler.js';
import { openaiHandler, type StreamChunk } from '../../handlers/openai-handler.js';
import { directApiHandler } from '../../handlers/direct-api-handler.js';
import { modelRouter, type ModelConfig } from '../../models/model-router.js';
import { responseValidator } from '../../utils/response-validator.js';
import { SecureLogger } from '../../utils/secure-logger.js';
import { config } from '../../config/app-config.js';

export interface StreamingRoute {
  method: 'sap-aicore-true' | 'direct-api-true' | 'sap-aicore-mock' | 'fallback-mock';
  handler: string;
  reason: string;
  cost?: 'low' | 'medium' | 'high';
}

export interface StreamingPreferences {
  preferDirectApi?: boolean;
  preferTrueStreaming?: boolean;
  costOptimization?: boolean;
  fallbackToMock?: boolean;
}

export class StreamingRouter {
  private static instance: StreamingRouter;
  private readonly defaultPreferences: StreamingPreferences = {
    preferDirectApi: process.env.PREFER_DIRECT_API_STREAMING === 'true',
    preferTrueStreaming: true,
    costOptimization: false,
    fallbackToMock: true
  };

  private constructor() {}

  static getInstance(): StreamingRouter {
    if (!StreamingRouter.instance) {
      StreamingRouter.instance = new StreamingRouter();
    }
    return StreamingRouter.instance;
  }

  /**
   * Determine the best streaming route for a model
   */
  async determineStreamingRoute(
    modelName: string,
    preferences: StreamingPreferences = {}
  ): Promise<StreamingRoute> {
    const prefs = { ...this.defaultPreferences, ...preferences };
    const modelConfig = modelRouter.getModelConfig(modelName);
    
    if (!modelConfig) {
      throw new Error(`Model ${modelName} not found in configuration`);
    }

    // Get or detect streaming capabilities
    const capability = await this.getStreamingCapability(modelName, modelConfig);
    
    // Determine the best route based on capabilities and preferences
    return this.selectOptimalRoute(modelName, modelConfig, capability, prefs);
  }

  /**
   * Stream response using the determined route
   */
  async *streamResponse(
    modelName: string,
    messages: any[],
    preferences: StreamingPreferences = {}
  ): AsyncIterable<StreamChunk> {
    const route = await this.determineStreamingRoute(modelName, preferences);
    
    SecureLogger.logDebug(`🌊 Using streaming route: ${route.method} (${route.reason})`);

    try {
      switch (route.method) {
        case 'sap-aicore-true':
          yield* this.streamViaSapAiCoreTrue(modelName, messages);
          break;
          
        case 'direct-api-true':
          yield* this.streamViaDirectApiTrue(modelName, messages);
          break;
          
        case 'sap-aicore-mock':
          yield* this.streamViaSapAiCoreMock(modelName, messages);
          break;
          
        case 'fallback-mock':
          yield* this.streamViaFallbackMock(modelName, messages);
          break;
          
        default:
          throw new Error(`Unknown streaming route: ${route.method}`);
      }
    } catch (error) {
      SecureLogger.logError('Streaming route execution', error, `${modelName}:${route.method}`);
      
      // Try fallback if enabled
      if (preferences.fallbackToMock !== false && route.method !== 'fallback-mock') {
        SecureLogger.logDebug(`🔄 Falling back to mock streaming for ${modelName}`);
        yield* this.streamViaFallbackMock(modelName, messages);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get streaming capability for a model
   */
  private async getStreamingCapability(
    modelName: string,
    modelConfig: ModelConfig
  ): Promise<StreamingCapability> {
    const directApiConfig = this.getDirectApiConfig(modelName, modelConfig);
    const deploymentId = modelConfig.deploymentId || 'unknown';
    
    return streamingDetectionService.detectStreamingCapability(
      modelName,
      deploymentId,
      directApiConfig
    );
  }

  /**
   * Select the optimal streaming route
   */
  private selectOptimalRoute(
    modelName: string,
    modelConfig: ModelConfig,
    capability: StreamingCapability,
    preferences: StreamingPreferences
  ): StreamingRoute {
    // Priority 1: Direct API true streaming (if preferred and available)
    if (preferences.preferDirectApi && capability.directApi && this.isDirectApiAvailable(modelName)) {
      return {
        method: 'direct-api-true',
        handler: this.getDirectApiHandler(modelName),
        reason: 'Direct API streaming preferred and available',
        cost: 'medium'
      };
    }

    // Priority 2: SAP AI Core true streaming (if available)
    if (capability.sapAiCore && preferences.preferTrueStreaming) {
      return {
        method: 'sap-aicore-true',
        handler: 'openai-handler',
        reason: 'SAP AI Core native streaming available',
        cost: 'low'
      };
    }

    // Priority 3: Direct API true streaming (if available and true streaming preferred)
    if (capability.directApi && preferences.preferTrueStreaming && this.isDirectApiAvailable(modelName)) {
      return {
        method: 'direct-api-true',
        handler: this.getDirectApiHandler(modelName),
        reason: 'Direct API streaming available, SAP AI Core streaming not supported',
        cost: 'medium'
      };
    }

    // Priority 4: SAP AI Core mock streaming
    if (preferences.fallbackToMock !== false) {
      return {
        method: 'sap-aicore-mock',
        handler: 'direct-api-handler',
        reason: 'True streaming not available, using SAP AI Core with mock streaming',
        cost: 'low'
      };
    }

    // Priority 5: Fallback mock streaming
    return {
      method: 'fallback-mock',
      handler: 'openai-handler',
      reason: 'Fallback to mock streaming',
      cost: 'low'
    };
  }

  /**
   * Stream via SAP AI Core true streaming
   */
  private async *streamViaSapAiCoreTrue(modelName: string, messages: any[]): AsyncIterable<StreamChunk> {
    yield* openaiHandler.streamProviderAPI(modelName, messages);
  }

  /**
   * Stream via direct API true streaming
   */
  private async *streamViaDirectApiTrue(modelName: string, messages: any[]): AsyncIterable<StreamChunk> {
    let streamGenerator: AsyncIterable<any>;
    
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      streamGenerator = anthropicDirectHandler.streamResponse(messages);
    } else if (modelName.includes('gemini') || modelName.includes('google')) {
      streamGenerator = geminiDirectHandler.streamResponse(messages);
    } else {
      throw new Error(`No direct API handler available for model: ${modelName}`);
    }

    // Validate and correct each streaming chunk
    for await (const chunk of streamGenerator) {
      const validation = responseValidator.validateStreamChunk(chunk, modelName);
      
      if (validation.corrected) {
        SecureLogger.logDebug(`Direct API stream chunk corrected for ${modelName}: ${validation.issues.join(', ')}`);
        yield validation.correctedChunk!;
      } else {
        yield chunk;
      }
    }
  }

  /**
   * Stream via SAP AI Core with mock streaming
   */
  private async *streamViaSapAiCoreMock(modelName: string, messages: any[]): AsyncIterable<StreamChunk> {
    // Get full response first, then simulate streaming
    const response = await directApiHandler.callDirectAPI(modelName, messages, false);
    
    if (!response.success) {
      throw new Error('SAP AI Core API call failed');
    }

    // Use optimized mock streaming algorithm
    yield* this.optimizedMockStreaming(response.text, modelName);
  }

  /**
   * Optimized mock streaming with dynamic chunk sizing and natural delays
   */
  private async *optimizedMockStreaming(text: string, modelName: string): AsyncIterable<StreamChunk> {
    const streamingConfig = config.streaming.mockStreaming;
    const words = text.split(/(\s+)/); // Split on whitespace but keep separators
    let currentChunk = '';
    let chunkIndex = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentChunk += word;

      // Dynamic chunk size calculation
      const baseSize = streamingConfig.baseChunkSize;
      const variation = streamingConfig.chunkSizeVariation;
      const targetChunkSize = streamingConfig.wordBoundaryAware ? 
        baseSize + Math.floor(Math.random() * variation) :
        baseSize;

      // Check if we should send this chunk
      const shouldSendChunk = 
        currentChunk.length >= targetChunkSize ||
        i === words.length - 1 || // Last chunk
        (streamingConfig.wordBoundaryAware && word.includes('.')) || // Sentence boundary
        (streamingConfig.wordBoundaryAware && word.includes('!')) ||
        (streamingConfig.wordBoundaryAware && word.includes('?'));

      if (shouldSendChunk && currentChunk.trim()) {
        const rawChunk = {
          delta: currentChunk,
          finished: false
        };

        // Batch validation for better performance
        const chunkToYield = config.streaming.validation.asyncValidation ?
          rawChunk : // Skip validation if async validation is enabled
          this.validateChunk(rawChunk, modelName);

        yield chunkToYield;

        // Natural streaming delay with variation
        const baseDelay = streamingConfig.baseDelay;
        const delayVariation = streamingConfig.delayVariation;
        const delay = baseDelay + Math.floor(Math.random() * delayVariation);
        
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        currentChunk = '';
        chunkIndex++;
      }
    }

    // Send any remaining content
    if (currentChunk.trim()) {
      yield {
        delta: currentChunk,
        finished: false
      };
    }

    // Send final chunk with usage info
    const finalChunk = {
      delta: '',
      usage: {
        promptTokens: 0, // SAP AI Core doesn't provide detailed usage
        completionTokens: text.length,
        totalTokens: text.length
      },
      finished: true
    };

    yield finalChunk;
  }

  /**
   * Validate chunk with performance optimization
   */
  private validateChunk(chunk: any, modelName: string): StreamChunk {
    if (config.streaming.validation.bypassTrustedSources) {
      // Skip validation for trusted models/sources
      return chunk;
    }

    const validation = responseValidator.validateStreamChunk(chunk, modelName);
    if (validation.corrected) {
      SecureLogger.logDebug(`Mock stream chunk corrected for ${modelName}: ${validation.issues.join(', ')}`);
      return validation.correctedChunk!;
    }
    
    return chunk;
  }

  /**
   * Stream via fallback mock streaming
   */
  private async *streamViaFallbackMock(modelName: string, messages: any[]): AsyncIterable<StreamChunk> {
    // Use the existing mock streaming from openai-handler
    yield* openaiHandler.streamProviderAPI(modelName, messages);
  }

  /**
   * Get direct API configuration for a model
   */
  private getDirectApiConfig(modelName: string, modelConfig: ModelConfig): DirectApiConfig | undefined {
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      return {
        endpoint: 'https://api.anthropic.com/v1/messages',
        requiresApiKey: 'ANTHROPIC_API_KEY',
        streamingEndpoint: 'https://api.anthropic.com/v1/messages',
        headers: {
          'anthropic-version': '2023-06-01'
        }
      };
    }

    if (modelName.includes('gemini') || modelName.includes('google')) {
      return {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        requiresApiKey: 'GOOGLE_AI_API_KEY',
        streamingEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent'
      };
    }

    return undefined;
  }

  /**
   * Check if direct API is available for a model
   */
  private isDirectApiAvailable(modelName: string): boolean {
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      return AnthropicDirectHandler.isAvailable();
    }

    if (modelName.includes('gemini') || modelName.includes('google')) {
      return GeminiDirectHandler.isAvailable();
    }

    return false;
  }

  /**
   * Get the appropriate direct API handler name
   */
  private getDirectApiHandler(modelName: string): string {
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      return 'anthropic-direct-handler';
    }

    if (modelName.includes('gemini') || modelName.includes('google')) {
      return 'gemini-direct-handler';
    }

    return 'unknown';
  }

  /**
   * Get routing statistics for monitoring
   */
  getRoutingStats(): Record<string, { method: string; count: number; lastUsed: string }> {
    // This would be implemented with actual usage tracking
    // For now, return empty stats
    return {};
  }

  /**
   * Force refresh streaming capabilities for all models
   */
  async refreshAllCapabilities(): Promise<void> {
    streamingDetectionService.clearCache();
    SecureLogger.logDebug('🔄 Streaming capabilities cache refreshed');
  }
}

export const streamingRouter = StreamingRouter.getInstance();
