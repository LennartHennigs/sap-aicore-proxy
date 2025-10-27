/**
 * Secure logging utility that prevents information disclosure
 * Removes sensitive data from logs while maintaining operational visibility
 */

export class SecureLogger {
  private static isStartupPhase = true;

  /**
   * Check if we're in development mode (dynamic check for testing)
   */
  private static get isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * Mark the end of startup phase to resume normal logging
   */
  static endStartupPhase(): void {
    this.isStartupPhase = false;
  }

  /**
   * Log successful authentication without exposing tokens
   */
  static logAuthSuccess(context?: string): void {
    // Only silence during startup phase
    if (this.isStartupPhase) {
      return;
    }
    const message = context ? `✅ Authentication successful for ${context}` : '✅ Authentication successful';
    console.log(message);
  }

  /**
   * Log authentication failure without exposing credentials
   */
  static logAuthFailure(context?: string): void {
    const message = context ? `❌ Authentication failed for ${context}` : '❌ Authentication failed';
    console.log(message);
  }

  /**
   * Log model operations without exposing deployment IDs
   */
  static logModelConfigured(modelName: string): void {
    // Only silence during startup phase
    if (this.isStartupPhase) {
      return;
    }
    console.log(`✅ Model ${modelName} configured successfully`);
  }

  /**
   * Log discovery operations without exposing sensitive IDs
   */
  static logDiscoveryStart(): void {
    console.log('🔎 Discovering model configurations...');
  }

  static logDiscoverySuccess(modelCount: number): void {
    console.log(`✅ Model discovery completed successfully (${modelCount} models)`);
  }

  /**
   * Log API operations without exposing internal details
   */
  static logApiError(operation: string, context?: string): void {
    const message = context 
      ? `❌ ${operation} failed for ${context} - check configuration`
      : `❌ ${operation} failed - check configuration`;
    console.log(message);
  }

  /**
   * Log server operations
   */
  static logServerStart(host: string, port: number): void {
    console.log(`🚀 SAP AI Core proxy running at http://${host}:${port}`);
  }

  static logServerShutdown(): void {
    console.log('🛑 Server shutting down gracefully');
  }

  static logServerClosed(): void {
    console.log('✅ Server closed');
  }

  /**
   * Log model pool operations without exposing sensitive data
   */
  static logModelPoolOperation(operation: string, modelName?: string): void {
    // Only silence during startup phase
    if (this.isStartupPhase) {
      return;
    }
    const message = modelName 
      ? `🔧 MODEL POOL: ${operation} for model ${modelName}`
      : `🔧 MODEL POOL: ${operation}`;
    console.log(message);
  }

  /**
   * Log validation results without exposing internal details
   */
  static logValidationSuccess(): void {
    console.log('✅ All model configurations validated successfully');
  }

  static logValidationFailure(errorCount: number): void {
    console.log(`❌ Model configuration validation failed (${errorCount} errors)`);
    console.log('⚠️ Server will continue but some models may not work correctly');
  }

  /**
   * Sanitize error messages for safe logging
   */
  static sanitizeError(error: unknown): string {
    if (!error) return 'Unknown error';
    
    if (error instanceof Error) {
      // In development, preserve original error message
      if (this.isDevelopment) {
        return error.message;
      }
      
      // In production, return generic message for most errors
      if (error.message.toLowerCase().includes('authentication')) {
        return 'Authentication failed';
      }
      if (error.message.toLowerCase().includes('network') || 
          error.message.toLowerCase().includes('fetch')) {
        return 'Network communication failed';
      }
      if (error.message.toLowerCase().includes('timeout')) {
        return 'Request timeout';
      }
      
      return 'An error occurred during processing';
    }
    
    return 'An error occurred during processing';
  }

  /**
   * Log errors safely without exposing sensitive information
   */
  static logError(operation: string, error: unknown, context?: string): void {
    const sanitizedError = this.sanitizeError(error);
    const message = context 
      ? `❌ ${operation} error in ${context}: ${sanitizedError}`
      : `❌ ${operation} error: ${sanitizedError}`;
    console.error(message);
  }

  /**
   * Log streaming events without exposing content
   */
  static logStreamingEvent(event: string, modelName?: string): void {
    const message = modelName 
      ? `🌊 Streaming ${event} for ${modelName}`
      : `🌊 Streaming ${event}`;
    console.log(message);
  }

  /**
   * Log deployment operations without exposing IDs
   */
  static logDeploymentOperation(operation: string, result: 'success' | 'failure'): void {
    const emoji = result === 'success' ? '✅' : '❌';
    console.log(`${emoji} Deployment ${operation} ${result}`);
  }

  /**
   * Development-only logging (completely disabled in production)
   */
  static logDebug(message: string, data?: any): void {
    if (this.isDevelopment && data) {
      console.log(`🔍 DEBUG: ${message}`, data);
    } else if (this.isDevelopment) {
      console.log(`🔍 DEBUG: ${message}`);
    }
    // Completely silent in production
  }

  /**
   * Log configuration info without exposing sensitive values
   */
  static logConfigInfo(key: string, hasValue: boolean): void {
    const status = hasValue ? 'configured' : 'not configured';
    console.log(`🔧 ${key}: ${status}`);
  }

  /**
   * Log rate limiting events
   */
  static logRateLimitHit(ip: string, endpoint: string): void {
    console.log(`⚠️ RATE LIMIT: Rate limit exceeded from ${ip} on ${endpoint}`);
  }

  /**
   * Log SAP AI Core rate limit events
   */
  static logRateLimitStart(modelName: string, retryAfterSeconds?: number): void {
    const retryInfo = retryAfterSeconds ? ` (retry after ${retryAfterSeconds}s)` : '';
    console.log(`⚠️ RATE LIMIT: SAP AI Core rate limiting started for model '${modelName}'${retryInfo}`);
  }

  static logRateLimitRetry(modelName: string, retryCount: number, maxRetries: number, delaySeconds: number): void {
    console.log(`🔄 RATE LIMIT: Retrying model '${modelName}' (attempt ${retryCount}/${maxRetries}) in ${delaySeconds}s`);
  }

  static logRateLimitMaxRetriesExceeded(modelName: string): void {
    console.log(`❌ RATE LIMIT: Max retries exceeded for model '${modelName}' - requests will be rejected until rate limit clears`);
  }

  static logRateLimitRecovery(modelName: string, durationMs?: number): void {
    const duration = durationMs ? ` (duration: ${this.formatDuration(durationMs)})` : '';
    console.log(`✅ RATE LIMIT: SAP AI Core rate limiting ended for model '${modelName}'${duration}`);
  }

  static logRateLimitRecoveryFailed(modelName: string): void {
    console.log(`⚠️ RATE LIMIT: Recovery attempt failed for model '${modelName}' - still rate limited`);
  }

  static logRateLimitReset(modelName: string): void {
    console.log(`🔄 RATE LIMIT: Rate limit state reset for model '${modelName}'`);
  }

  /**
   * Format duration in milliseconds to human-readable format
   */
  private static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Log security events
   */
  static logSecurityEvent(event: string, details?: string): void {
    // Only silence during startup phase
    if (this.isStartupPhase) {
      return;
    }
    const message = details 
      ? `🔒 SECURITY: ${event} - ${details}`
      : `🔒 SECURITY: ${event}`;
    console.log(message);
  }

  /**
   * Sanitize data for safe logging by removing sensitive information
   */
  static sanitizeForLogging(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeForLogging(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        
        // Sensitive field detection
        if (lowerKey.includes('token') || 
            lowerKey.includes('secret') || 
            lowerKey.includes('key') || 
            lowerKey.includes('password') || 
            lowerKey.includes('auth') ||
            lowerKey.includes('bearer') ||
            lowerKey.includes('client_secret') ||
            lowerKey.includes('deployment_id') ||
            lowerKey.includes('api_key')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeForLogging(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Sanitize strings by masking sensitive patterns
   */
  private static sanitizeString(str: string): string {
    // Mask JWT tokens (specific pattern)
    str = str.replace(/eyJ[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+/g, '[REDACTED]');
    
    // Mask Bearer tokens
    str = str.replace(/Bearer\s+[A-Za-z0-9+/=_-]+/gi, 'Bearer [REDACTED]');
    
    // Mask API keys (long alphanumeric strings)
    str = str.replace(/[A-Za-z0-9]{32,}/g, '[REDACTED]');
    
    // Mask deployment IDs
    str = str.replace(/dep-[A-Za-z0-9-]+/gi, 'dep-[REDACTED]');
    
    return str;
  }
}
