import { tokenManager } from '../auth/token-manager.js';
import { modelRouter, type ModelConfig } from '../models/model-router.js';
import { config } from '../config/app-config.js';
import { ModelStrategyFactory } from '../strategies/ModelStrategyFactory.js';
import { responseValidator } from '../utils/response-validator.js';
import { SecureLogger } from '../utils/secure-logger.js';
import { rateLimitManager } from '../utils/rate-limit-manager.js';
import type { DirectApiResponse } from '../strategies/ModelStrategy.js';

// Re-export for backward compatibility
export type { DirectApiResponse };

export class DirectApiHandler {
  async callDirectAPI(modelName: string, messages: any[], stream: boolean = false): Promise<DirectApiResponse> {
    // Check if model is currently rate limited and can't retry
    if (rateLimitManager.isRateLimited(modelName)) {
      const status = rateLimitManager.getModelRateLimitStatus(modelName);
      const nextRetryTime = status.nextRetryTime ? new Date(status.nextRetryTime) : null;
      const waitTime = nextRetryTime ? Math.ceil((nextRetryTime.getTime() - Date.now()) / 1000) : 0;
      
      throw new Error(`Model ${modelName} is rate limited. Max retries exceeded. ${waitTime > 0 ? `Please wait ${waitTime} seconds before trying again.` : 'Please try again later.'}`);
    }

    const modelConfig = modelRouter.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model ${modelName} not found in configuration`);
    }

    // Execute the API call with retry logic
    return await this.executeWithRetry(modelName, modelConfig, messages, stream);
  }

  /**
   * Execute API call with intelligent retry logic for rate limiting
   */
  private async executeWithRetry(
    modelName: string, 
    modelConfig: ModelConfig, 
    messages: any[], 
    stream: boolean
  ): Promise<DirectApiResponse> {
    let lastError: Error | null = null;

    while (rateLimitManager.canRetry(modelName)) {
      try {
        const result = await this.performApiCall(modelName, modelConfig, messages, stream);
        
        // If we get here, the call was successful
        rateLimitManager.handleSuccess(modelName);
        return result;
        
      } catch (error) {
        lastError = error as Error;
        
        // Check if this is a 429 rate limit error
        if (this.isRateLimitError(error)) {
          const responseHeaders = this.extractResponseHeaders(error);
          rateLimitManager.handleRateLimit(modelName, responseHeaders);
          
          // If we can still retry, wait for the calculated delay
          if (rateLimitManager.canRetry(modelName)) {
            const status = rateLimitManager.getModelRateLimitStatus(modelName);
            const nextRetryTime = status.nextRetryTime ? new Date(status.nextRetryTime) : null;
            
            if (nextRetryTime) {
              const delayMs = Math.max(0, nextRetryTime.getTime() - Date.now());
              if (delayMs > 0) {
                rateLimitManager.markRecovering(modelName);
                await this.sleep(delayMs);
              }
            }
            
            // Continue the retry loop
            continue;
          } else {
            // Max retries exceeded, throw the rate limit error
            throw error;
          }
        } else {
          // Non-rate-limit error, don't retry
          throw error;
        }
      }
    }

    // If we get here, we exhausted retries
    throw lastError || new Error(`Failed to call API for model ${modelName} after maximum retries`);
  }

  /**
   * Perform the actual API call
   */
  private async performApiCall(
    modelName: string,
    modelConfig: ModelConfig,
    messages: any[],
    stream: boolean
  ): Promise<DirectApiResponse> {
    const token = await tokenManager.getAccessToken();
    const { deploymentUrl, requestBody } = this.buildRequest(modelConfig, messages);
    
    const response = await fetch(deploymentUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'AI-Resource-Group': 'default'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const prompt = this.extractPromptForLogging(messages);
      
      // Create enhanced error with response headers for rate limit detection
      const error = new Error(`SAP AI Core API error: ${response.status} - ${errorText}`) as any;
      error.status = response.status;
      error.responseHeaders = this.responseHeadersToObject(response.headers);
      error.modelName = modelName;
      
      // Log the API error with sanitized context (but don't log 429s repeatedly)
      if (response.status !== 429) {
        SecureLogger.logError(
          'Direct API call failed', 
          new Error(`HTTP ${response.status}: ${errorText}`),
          `model: ${modelName}, prompt: "${prompt.substring(0, 100)}..."`
        );
      }
      
      throw error;
    }

    const result = await response.json();
    
    // Parse the response using the strategy
    const parsedResponse = this.parseResponse(modelConfig, result);
    
    // Extract prompt for logging (get the last user message)
    const prompt = this.extractPromptForLogging(messages);
    
    // Validate and correct the response to prevent "Invalid API Response" errors in Cline
    // CRITICAL: This must never break API calls - wrap in try/catch
    try {
      const validation = responseValidator.validateAndCorrectResponse(parsedResponse, modelName, prompt);
      
      if (validation.corrected) {
        SecureLogger.logDebug(`Response corrected for ${modelName}: ${validation.issues.join(', ')}`);
        return validation.correctedResponse!;
      }
      
      if (!validation.isValid) {
        SecureLogger.logError(`Response validation failed for ${modelName}`, new Error(validation.issues.join(', ')));
        // Return corrected response even if validation flagged issues
        return validation.correctedResponse || parsedResponse;
      }
      
      return parsedResponse;
    } catch (validationError) {
      // If response validation completely fails, log the error but return the original parsed response
      SecureLogger.logError(`Response validator threw error for ${modelName} (non-critical)`, validationError);
      return parsedResponse;
    }
  }

  /**
   * Check if an error is a rate limit error (429)
   */
  private isRateLimitError(error: any): boolean {
    return error?.status === 429 || 
           (error?.message && error.message.includes('TooManyRequest')) ||
           (error?.message && error.message.includes('rate limit'));
  }

  /**
   * Extract response headers from error for rate limit handling
   */
  private extractResponseHeaders(error: any): Record<string, string> | undefined {
    return error?.responseHeaders;
  }

  /**
   * Convert Headers object to plain object
   */
  private responseHeadersToObject(headers: Headers): Record<string, string> {
    const headersObj: Record<string, string> = {};
    headers.forEach((value, key) => {
      headersObj[key.toLowerCase()] = value;
    });
    return headersObj;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract prompt from messages for logging
   */
  private extractPromptForLogging(messages: any[]): string {
    // Find the last user message
    const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
    if (lastUserMessage?.content) {
      if (typeof lastUserMessage.content === 'string') {
        return lastUserMessage.content.length > 500 
          ? lastUserMessage.content.substring(0, 500) + '...[truncated]'
          : lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.content)) {
        // Extract text from array content (may include images)
        const textParts = lastUserMessage.content
          .filter(item => item.type === 'text' || typeof item === 'string')
          .map(item => typeof item === 'string' ? item : item.text)
          .join(' ');
        return textParts.length > 500 
          ? textParts.substring(0, 500) + '...[truncated]'
          : textParts;
      }
    }
    return 'No user message found';
  }

  private buildRequest(modelConfig: ModelConfig, messages: any[]): { deploymentUrl: string; requestBody: any } {
    const baseUrl = `${config.aicore.baseUrl}/v2/inference/deployments/${modelConfig.deploymentId}`;
    
    // Use strategy pattern to handle different model formats
    const strategy = ModelStrategyFactory.create(modelConfig.requestFormat);
    
    return strategy.buildRequest(baseUrl, modelConfig, messages);
  }


  private parseResponse(modelConfig: ModelConfig, result: any): DirectApiResponse {
    // Use strategy pattern to handle different response formats
    const strategy = ModelStrategyFactory.create(modelConfig.requestFormat);
    
    return strategy.parseResponse(result);
  }
}

export const directApiHandler = new DirectApiHandler();
