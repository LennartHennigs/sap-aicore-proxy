/**
 * Rate Limit Manager for SAP AI Core API
 * Handles rate limit state tracking, retry logic, and intelligent logging
 */

import { SecureLogger } from './secure-logger.js';

export enum RateLimitState {
  NORMAL = 'NORMAL',
  RATE_LIMITED = 'RATE_LIMITED',
  RECOVERING = 'RECOVERING'
}

interface ModelRateLimitInfo {
  state: RateLimitState;
  rateLimitStartTime?: Date;
  lastAttemptTime?: Date;
  consecutiveFailures: number;
  nextRetryTime?: Date;
  retryCount: number;
  maxRetries: number;
  rateLimitDuration?: number; // in milliseconds
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitterFactor: number;
}

export class RateLimitManager {
  private static instance: RateLimitManager;
  private modelStates: Map<string, ModelRateLimitInfo> = new Map();
  
  private readonly config: RetryConfig = {
    maxRetries: parseInt(process.env.RATE_LIMIT_MAX_RETRIES || '3', 10),
    baseDelayMs: parseInt(process.env.RATE_LIMIT_BASE_DELAY_MS || '1000', 10),
    maxDelayMs: parseInt(process.env.RATE_LIMIT_MAX_DELAY_MS || '30000', 10),
    exponentialBase: parseFloat(process.env.RATE_LIMIT_EXPONENTIAL_BASE || '2'),
    jitterFactor: parseFloat(process.env.RATE_LIMIT_JITTER_FACTOR || '0.1')
  };

  private constructor() {}

  public static getInstance(): RateLimitManager {
    if (!RateLimitManager.instance) {
      RateLimitManager.instance = new RateLimitManager();
    }
    return RateLimitManager.instance;
  }

  /**
   * Get or initialize rate limit info for a model
   */
  private getModelInfo(modelName: string): ModelRateLimitInfo {
    if (!this.modelStates.has(modelName)) {
      this.modelStates.set(modelName, {
        state: RateLimitState.NORMAL,
        consecutiveFailures: 0,
        retryCount: 0,
        maxRetries: this.config.maxRetries
      });
    }
    return this.modelStates.get(modelName)!;
  }

  /**
   * Check if a model is currently rate limited
   */
  public isRateLimited(modelName: string): boolean {
    const info = this.getModelInfo(modelName);
    
    // Only consider rate limited if max retries exceeded
    return info.state === RateLimitState.RATE_LIMITED && info.retryCount > info.maxRetries;
  }

  /**
   * Check if enough time has passed for a retry attempt
   */
  public canRetry(modelName: string): boolean {
    const info = this.getModelInfo(modelName);
    
    if (info.state === RateLimitState.NORMAL) {
      return true;
    }
    
    if (info.retryCount >= info.maxRetries) {
      return false;
    }
    
    if (!info.nextRetryTime) {
      return true;
    }
    
    return Date.now() >= info.nextRetryTime.getTime();
  }

  /**
   * Get the next retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(retryCount: number, retryAfterSeconds?: number): number {
    // If server provides Retry-After header, respect it
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1000, this.config.maxDelayMs);
    }
    
    // Exponential backoff with jitter
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.exponentialBase, retryCount);
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    const totalDelay = exponentialDelay + jitter;
    
    return Math.min(totalDelay, this.config.maxDelayMs);
  }

  /**
   * Parse Retry-After header from response
   */
  private parseRetryAfter(retryAfterHeader?: string): number | undefined {
    if (!retryAfterHeader) return undefined;
    
    // Try to parse as seconds (number)
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) {
      return seconds;
    }
    
    // Try to parse as HTTP date
    try {
      const date = new Date(retryAfterHeader);
      const secondsUntil = Math.ceil((date.getTime() - Date.now()) / 1000);
      return secondsUntil > 0 ? secondsUntil : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Handle a 429 rate limit response
   */
  public handleRateLimit(modelName: string, responseHeaders?: Record<string, string>): void {
    const info = this.getModelInfo(modelName);
    const now = new Date();
    
    // Parse retry-after header if present
    const retryAfterHeader = responseHeaders?.['retry-after'] || responseHeaders?.['Retry-After'];
    const retryAfterSeconds = this.parseRetryAfter(retryAfterHeader);
    
    // State transition logging
    if (info.state === RateLimitState.NORMAL) {
      // First time hitting rate limit
      info.rateLimitStartTime = now;
      info.state = RateLimitState.RATE_LIMITED;
      info.consecutiveFailures = 1;
      info.retryCount = 0;
      
      SecureLogger.logRateLimitStart(modelName, retryAfterSeconds);
    } else {
      // Already rate limited, increment counters
      info.consecutiveFailures++;
      
      if (info.state === RateLimitState.RECOVERING) {
        // We were recovering but hit rate limit again
        info.state = RateLimitState.RATE_LIMITED;
        SecureLogger.logRateLimitRecoveryFailed(modelName);
      }
    }
    
    info.lastAttemptTime = now;
    info.retryCount++;
    
    // Calculate next retry time
    const delayMs = this.calculateRetryDelay(info.retryCount - 1, retryAfterSeconds);
    info.nextRetryTime = new Date(now.getTime() + delayMs);
    
    // Log retry attempt if we haven't exceeded max retries
    if (info.retryCount <= info.maxRetries) {
      SecureLogger.logRateLimitRetry(modelName, info.retryCount, info.maxRetries, Math.ceil(delayMs / 1000));
    } else {
      SecureLogger.logRateLimitMaxRetriesExceeded(modelName);
    }
  }

  /**
   * Handle a successful response after being rate limited
   */
  public handleSuccess(modelName: string): void {
    const info = this.getModelInfo(modelName);
    
    if (info.state !== RateLimitState.NORMAL) {
      const rateLimitDuration = info.rateLimitStartTime 
        ? Date.now() - info.rateLimitStartTime.getTime()
        : undefined;
      
      // Log recovery success
      SecureLogger.logRateLimitRecovery(modelName, rateLimitDuration);
      
      // Reset state
      info.state = RateLimitState.NORMAL;
      info.consecutiveFailures = 0;
      info.retryCount = 0;
      info.rateLimitStartTime = undefined;
      info.nextRetryTime = undefined;
      info.rateLimitDuration = rateLimitDuration;
    }
    
    info.lastAttemptTime = new Date();
  }

  /**
   * Mark a model as attempting recovery
   */
  public markRecovering(modelName: string): void {
    const info = this.getModelInfo(modelName);
    if (info.state === RateLimitState.RATE_LIMITED) {
      info.state = RateLimitState.RECOVERING;
    }
  }

  /**
   * Get rate limit status for all models
   */
  public getRateLimitStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    this.modelStates.forEach((info, modelName) => {
      status[modelName] = {
        state: info.state,
        isRateLimited: this.isRateLimited(modelName),
        canRetry: this.canRetry(modelName),
        consecutiveFailures: info.consecutiveFailures,
        retryCount: info.retryCount,
        maxRetries: info.maxRetries,
        nextRetryTime: info.nextRetryTime?.toISOString(),
        rateLimitStartTime: info.rateLimitStartTime?.toISOString(),
        rateLimitDuration: info.rateLimitDuration
      };
    });
    
    return status;
  }

  /**
   * Get rate limit status for a specific model
   */
  public getModelRateLimitStatus(modelName: string): any {
    const info = this.getModelInfo(modelName);
    
    return {
      state: info.state,
      isRateLimited: this.isRateLimited(modelName),
      canRetry: this.canRetry(modelName),
      consecutiveFailures: info.consecutiveFailures,
      retryCount: info.retryCount,
      maxRetries: info.maxRetries,
      nextRetryTime: info.nextRetryTime?.toISOString(),
      rateLimitStartTime: info.rateLimitStartTime?.toISOString(),
      rateLimitDuration: info.rateLimitDuration
    };
  }

  /**
   * Reset rate limit state for a model (for testing or manual recovery)
   */
  public resetModelState(modelName: string): void {
    this.modelStates.delete(modelName);
    SecureLogger.logRateLimitReset(modelName);
  }

  /**
   * Get configuration for monitoring
   */
  public getConfig(): RetryConfig {
    return { ...this.config };
  }
}

export const rateLimitManager = RateLimitManager.getInstance();
