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
 * Optional: More permissive authentication for development/testing
 * This middleware can be used during development but should not be used in production
 */
export const authenticateApiKeyDev = (req: Request, res: Response, next: NextFunction) => {
  // Skip authentication for health endpoint
  if (req.path === '/health') {
    return next();
  }

  const authHeader = req.get('Authorization');
  const providedKey = extractBearerToken(authHeader);

  // In development mode, also accept the legacy "any-string-works" for backward compatibility
  if (!providedKey) {
    SecureLogger.logSecurityEvent('Dev auth failed', `Missing API key from ${req.ip}`);
    
    return res.status(401).json({
      error: {
        message: 'Authentication required. Please provide a valid API key in the Authorization header.',
        type: 'authentication_error',
        code: 'missing_api_key'
      }
    });
  }

  // Check against real API key first
  const isValidRealKey = ApiKeyManager.validateApiKey(providedKey);
  
  // In development, also accept legacy format for backward compatibility
  const isValidDevKey = process.env.NODE_ENV !== 'production' && providedKey === 'any-string-works';
  
  if (!isValidRealKey && !isValidDevKey) {
    SecureLogger.logSecurityEvent('Dev auth failed', `Invalid API key from ${req.ip}`);
    
    return res.status(401).json({
      error: {
        message: 'Invalid API key provided. Please check your authorization credentials.',
        type: 'authentication_error',
        code: 'invalid_api_key'
      }
    });
  }

  if (isValidDevKey) {
    SecureLogger.logSecurityEvent('Dev auth used', `Legacy dev key used from ${req.ip} - consider upgrading`);
  } else {
    SecureLogger.logSecurityEvent('Authentication successful', `Valid API key from ${req.ip}`);
  }
  
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
