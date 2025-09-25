import { tokenManager } from '../../auth/token-manager.js';
import { config } from '../../config/app-config.js';
import { SecureLogger } from '../../utils/secure-logger.js';

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
  private readonly DETECTION_TIMEOUT = 10000; // 10 seconds
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

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
    directApiConfig?: DirectApiConfig
  ): Promise<StreamingCapability> {
    // Check cache first
    const cached = this.getCachedCapability(modelName);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    SecureLogger.logDebug(`🔍 Detecting streaming capabilities for model: ${modelName}`);

    const capability: StreamingCapability = {
      sapAiCore: false,
      directApi: false,
      lastChecked: new Date(),
      autoDetected: true
    };

    try {
      // Test SAP AI Core streaming
      capability.sapAiCore = await this.testSapAiCoreStreaming(deploymentId);
      
      // Test direct API streaming if config provided
      if (directApiConfig) {
        capability.directApi = await this.testDirectApiStreaming(directApiConfig);
      }

      // Cache the result
      this.capabilityCache.set(modelName, capability);
      
      SecureLogger.logDebug(`✅ Streaming detection complete for ${modelName}:`, {
        sapAiCore: capability.sapAiCore,
        directApi: capability.directApi
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
      const timeoutId = setTimeout(() => controller.abort(), this.DETECTION_TIMEOUT);

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
      const timeoutId = setTimeout(() => controller.abort(), this.DETECTION_TIMEOUT);

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
    return (now - cacheTime) < this.CACHE_DURATION;
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
    
    for (const [modelName, capability] of this.capabilityCache) {
      summary[modelName] = {
        sapAiCore: capability.sapAiCore,
        directApi: capability.directApi,
        lastChecked: capability.lastChecked.toISOString()
      };
    }
    
    return summary;
  }
}

export const streamingDetectionService = StreamingDetectionService.getInstance();
