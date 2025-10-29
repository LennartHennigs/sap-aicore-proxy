import { tokenManager } from '../../auth/token-manager.js';
import { config } from '../../config/app-config.js';
import { SecureLogger } from '../../utils/secure-logger.js';

interface PerformanceMetrics {
  detectionStartTime: number;
  detectionEndTime: number;
  testCount: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface StreamingCapability {
  sapAiCore: boolean;
  directApi: boolean;
  lastChecked: Date;
  autoDetected: boolean;
  error?: string;
}

export interface DirectApiConfig {
  endpoint: string;
  requiresApiKey: string;
  streamingEndpoint?: string;
  headers?: Record<string, string>;
}

export class StreamingDetectionService {
  private static instance: StreamingDetectionService;
  private capabilityCache = new Map<string, StreamingCapability>();
  private performanceMetrics: PerformanceMetrics = {
    detectionStartTime: 0,
    detectionEndTime: 0,
    testCount: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  private constructor() {}

  static getInstance(): StreamingDetectionService {
    if (!StreamingDetectionService.instance) {
      StreamingDetectionService.instance = new StreamingDetectionService();
    }
    return StreamingDetectionService.instance;
  }

  /**
   * Detect streaming capabilities for a model
   */
  async detectStreamingCapability(
    modelName: string, 
    deploymentId: string,
    directApiConfig?: DirectApiConfig,
    modelConfig?: any
  ): Promise<StreamingCapability> {
    const startTime = Date.now();
    this.performanceMetrics.testCount++;

    // Check cache first
    const cached = this.getCachedCapability(modelName);
    if (cached && this.isCacheValid(cached)) {
      this.performanceMetrics.cacheHits++;
      return cached;
    }

    this.performanceMetrics.cacheMisses++;
    SecureLogger.logDebug(`🔍 Detecting streaming capabilities for model: ${modelName}`);

    const capability: StreamingCapability = {
      sapAiCore: false,
      directApi: false,
      lastChecked: new Date(),
      autoDetected: true
    };

    try {
      // Test SAP AI Core streaming based on model type
      if (modelConfig?.apiType === 'provider') {
        // For provider models (like gpt-5-nano), check if they support streaming
        capability.sapAiCore = modelConfig?.supportsStreaming === true;
        SecureLogger.logDebug(`Provider model ${modelName}: streaming=${capability.sapAiCore} (from config)`);
      } else if (modelConfig?.apiType === 'direct' && modelConfig?.supportsStreaming === true) {
        // For direct API models with streaming configured, assume SAP AI Core supports it
        // This avoids false negatives when deployment endpoints aren't accessible during startup
        capability.sapAiCore = true;
        SecureLogger.logDebug(`Direct model ${modelName}: streaming=true (from config, skipping live test)`);
      } else {
        // For other direct API models, test the actual endpoint
        capability.sapAiCore = await this.testSapAiCoreStreaming(deploymentId);
      }
      
      // Test direct API streaming if config provided
      if (directApiConfig) {
        // For models configured with streaming support, assume direct API works too if API key is available
        const apiKeyAvailable = !!process.env[directApiConfig.requiresApiKey];
        if (modelConfig?.supportsStreaming === true && apiKeyAvailable) {
          capability.directApi = true;
          SecureLogger.logDebug(`Direct API ${modelName}: streaming=true (config + API key available)`);
        } else {
          capability.directApi = await this.testDirectApiStreaming(directApiConfig);
        }
      }

      // Cache the result
      this.capabilityCache.set(modelName, capability);
      
      const endTime = Date.now();
      const detectionTime = endTime - startTime;
      
      SecureLogger.logDebug(`✅ Streaming detection complete for ${modelName} (${detectionTime}ms):`, {
        sapAiCore: capability.sapAiCore,
        directApi: capability.directApi,
        detectionTimeMs: detectionTime
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      capability.error = errorMessage;
      SecureLogger.logError('Streaming detection', error, modelName);
    }

    return capability;
  }

  /**
   * Test if SAP AI Core supports streaming for a deployment
   */
  private async testSapAiCoreStreaming(deploymentId: string): Promise<boolean> {
    try {
      const token = await tokenManager.getAccessToken();
      const testUrl = `${config.aicore.baseUrl}/v2/inference/deployments/${deploymentId}/chat/completions`;
      
      // Create a minimal test request with streaming enabled
      const testRequest = {
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
        stream: true,
        temperature: 0.1
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.streaming.detection.timeout);

      try {
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'AI-Resource-Group': 'default'
          },
          body: JSON.stringify(testRequest),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check if response indicates streaming support
        const contentType = response.headers.get('content-type') || '';
        const isStreamingResponse = contentType.includes('text/event-stream') || 
                                  contentType.includes('application/x-ndjson') ||
                                  contentType.includes('text/plain');

        if (response.ok && isStreamingResponse) {
          // Try to read a small chunk to confirm streaming works
          const reader = response.body?.getReader();
          if (reader) {
            const { done } = await reader.read();
            reader.releaseLock();
            return !done; // If we got data, streaming works
          }
        }

        return false;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          SecureLogger.logDebug('SAP AI Core streaming test timed out');
        }
        return false;
      }
    } catch (error) {
      SecureLogger.logDebug(`SAP AI Core streaming test failed: ${error}`);
      return false;
    }
  }

  /**
   * Test if direct API supports streaming
   */
  private async testDirectApiStreaming(directApiConfig: DirectApiConfig): Promise<boolean> {
    try {
      // Check if API key is available
      const apiKey = process.env[directApiConfig.requiresApiKey];
      if (!apiKey) {
        SecureLogger.logDebug(`Direct API key ${directApiConfig.requiresApiKey} not available`);
        return false;
      }

      const testUrl = directApiConfig.streamingEndpoint || directApiConfig.endpoint;
      
      // Create provider-specific test request
      const testRequest = this.createDirectApiTestRequest(directApiConfig);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.streaming.detection.timeout);

      try {
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...directApiConfig.headers
          },
          body: JSON.stringify(testRequest),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check for streaming response
        const contentType = response.headers.get('content-type') || '';
        const isStreamingResponse = contentType.includes('text/event-stream') || 
                                  contentType.includes('application/x-ndjson');

        if (response.ok && isStreamingResponse) {
          const reader = response.body?.getReader();
          if (reader) {
            const { done } = await reader.read();
            reader.releaseLock();
            return !done;
          }
        }

        return false;
      } catch (error) {
        clearTimeout(timeoutId);
        return false;
      }
    } catch (error) {
      SecureLogger.logDebug(`Direct API streaming test failed: ${error}`);
      return false;
    }
  }

  /**
   * Create appropriate test request for different direct APIs
   */
  private createDirectApiTestRequest(directApiConfig: DirectApiConfig): any {
    const endpoint = directApiConfig.endpoint.toLowerCase();
    
    if (endpoint.includes('anthropic')) {
      return {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true
      };
    } else if (endpoint.includes('openai')) {
      return {
        model: 'gpt-3.5-turbo',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true
      };
    } else if (endpoint.includes('google') || endpoint.includes('gemini')) {
      return {
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 1 },
        stream: true
      };
    }

    // Generic test request
    return {
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 1,
      stream: true
    };
  }

  /**
   * Get cached capability if available
   */
  private getCachedCapability(modelName: string): StreamingCapability | null {
    return this.capabilityCache.get(modelName) || null;
  }

  /**
   * Check if cached capability is still valid
   */
  private isCacheValid(capability: StreamingCapability): boolean {
    const now = new Date().getTime();
    const cacheTime = capability.lastChecked.getTime();
    return (now - cacheTime) < config.streaming.detection.cacheTime;
  }

  /**
   * Force refresh capability detection for a model
   */
  async refreshCapability(
    modelName: string, 
    deploymentId: string,
    directApiConfig?: DirectApiConfig
  ): Promise<StreamingCapability> {
    this.capabilityCache.delete(modelName);
    return this.detectStreamingCapability(modelName, deploymentId, directApiConfig);
  }

  /**
   * Get all cached capabilities
   */
  getAllCapabilities(): Map<string, StreamingCapability> {
    return new Map(this.capabilityCache);
  }

  /**
   * Clear all cached capabilities
   */
  clearCache(): void {
    this.capabilityCache.clear();
    SecureLogger.logDebug('🗑️ Streaming capability cache cleared');
  }

  /**
   * Get capability summary for logging/monitoring
   */
  getCapabilitySummary(): Record<string, { sapAiCore: boolean; directApi: boolean; lastChecked: string }> {
    const summary: Record<string, { sapAiCore: boolean; directApi: boolean; lastChecked: string }> = {};
    
    this.capabilityCache.forEach((capability, modelName) => {
      summary[modelName] = {
        sapAiCore: capability.sapAiCore,
        directApi: capability.directApi,
        lastChecked: capability.lastChecked.toISOString()
      };
    });
    
    return summary;
  }

  /**
   * Get performance metrics for monitoring
   */
  getPerformanceMetrics(): PerformanceMetrics & { cacheHitRate: number; avgDetectionTimeMs: number } {
    const totalRequests = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (this.performanceMetrics.cacheHits / totalRequests) * 100 : 0;
    
    const avgDetectionTime = this.performanceMetrics.testCount > 0 ? 
      (this.performanceMetrics.detectionEndTime - this.performanceMetrics.detectionStartTime) / this.performanceMetrics.testCount : 0;

    return {
      ...this.performanceMetrics,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      avgDetectionTimeMs: Math.round(avgDetectionTime * 100) / 100
    };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      detectionStartTime: Date.now(),
      detectionEndTime: Date.now(),
      testCount: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    SecureLogger.logDebug('🔄 Performance metrics reset');
  }

  /**
   * Detect streaming capabilities for multiple models concurrently
   */
  async detectMultipleCapabilities(
    models: Array<{
      modelName: string;
      deploymentId: string;
      directApiConfig?: DirectApiConfig;
      modelConfig?: any;
    }>
  ): Promise<Map<string, StreamingCapability>> {
    const maxConcurrent = config.streaming.detection.concurrentTests;
    const results = new Map<string, StreamingCapability>();
    
    // Process models in batches
    for (let i = 0; i < models.length; i += maxConcurrent) {
      const batch = models.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async ({ modelName, deploymentId, directApiConfig, modelConfig }) => {
        try {
          const capability = await this.detectStreamingCapability(modelName, deploymentId, directApiConfig, modelConfig);
          return { modelName, capability };
        } catch (error) {
          SecureLogger.logError('Batch detection error', error, modelName);
          return {
            modelName,
            capability: {
              sapAiCore: false,
              directApi: false,
              lastChecked: new Date(),
              autoDetected: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            } as StreamingCapability
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ modelName, capability }) => {
        results.set(modelName, capability);
      });

      // Small delay between batches to avoid overwhelming endpoints
      if (i + maxConcurrent < models.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    SecureLogger.logDebug(`✅ Batch detection complete for ${models.length} models`, {
      totalModels: models.length,
      batchSize: maxConcurrent,
      successCount: Array.from(results.values()).filter(cap => !cap.error).length
    });

    return results;
  }
}

export const streamingDetectionService = StreamingDetectionService.getInstance();
