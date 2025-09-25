import { Request, Response, NextFunction } from 'express';
import { ApiKeyManager } from '../auth/api-key-manager.js';
import { SecureLogger } from '../utils/secure-logger.js';

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  // Check for Bearer token format: "Bearer sk-proj-..."
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    return null;
  }

  return bearerMatch[1].trim();
}

/**
 * API Key Authentication Middleware
 * Validates OpenAI-compatible Bearer token authentication
 */
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Skip authentication for health endpoint (monitoring purposes)
  if (req.path === '/health') {
    return next();
  }

  // Extract API key from Authorization header
  const authHeader = req.get('Authorization');
  const providedKey = extractBearerToken(authHeader);

  // Check if API key is provided
  if (!providedKey) {
    SecureLogger.logSecurityEvent('Authentication failed', `Missing API key from ${req.ip} on ${req.path}`);
    
    return res.status(401).json({
      error: {
        message: 'Authentication required. Please provide a valid API key in the Authorization header.',
        type: 'authentication_error',
        code: 'missing_api_key'
      }
    });
  }

  // Validate API key
  const isValid = ApiKeyManager.validateApiKey(providedKey);
  
  if (!isValid) {
    SecureLogger.logSecurityEvent('Authentication failed', `Invalid API key from ${req.ip} on ${req.path}`);
    
    return res.status(401).json({
      error: {
        message: 'Invalid API key provided. Please check your authorization credentials.',
        type: 'authentication_error',
        code: 'invalid_api_key'
      }
    });
  }

  // Log successful authentication (without exposing the key)
  SecureLogger.logSecurityEvent('Authentication successful', `Valid API key from ${req.ip} on ${req.path}`);
  
  // Authentication successful, proceed to next middleware
  next();
};


/**
 * Middleware to add API key information to response headers (for debugging)
 */
export const addApiKeyHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Add custom header indicating authentication method used
  res.set('X-Auth-Method', 'api-key');
  res.set('X-API-Version', '1.0');
  
  next();
};
