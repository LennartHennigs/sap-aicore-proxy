import { body, ValidationChain, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { modelRouter } from '../models/model-router.js';
import { SecureLogger } from '../utils/secure-logger.js';

// Configuration-driven validation limits (no magic numbers)
const getValidationLimits = () => ({
  maxMessages: parseInt(process.env.MAX_MESSAGES_PER_REQUEST || '50', 10),
  maxContentLength: parseInt(process.env.MAX_CONTENT_LENGTH || '50000', 10),
  maxTemperature: 2, // OpenAI standard
  minTemperature: 0,
});

// Model-aware token validation
const validateMaxTokens = (value: number, { req }: { req: Request }) => {
  if (!value) return true; // Optional field
  
  const modelName = req.body.model;
  if (!modelName) return true; // Will be caught by model validation
  
  const modelConfig = modelRouter.getModelConfig(modelName);
  if (!modelConfig) return true; // Will be caught by model validation
  
  const modelMaxTokens = modelConfig.max_tokens || 4000; // Reasonable default
  
  if (value > modelMaxTokens) {
    throw new Error(`max_tokens cannot exceed ${modelMaxTokens} for model ${modelName}`);
  }
  
  return true;
};

// Vision content validation
const validateVisionContent = (messages: any[], { req }: { req: Request }) => {
  const modelName = req.body.model;
  if (!modelName) return true; // Will be caught by model validation
  
  const supportsVision = modelRouter.supportsVision(modelName);
  
  const hasImages = messages.some(msg => 
    Array.isArray(msg.content) && 
    msg.content.some((item: any) => item.type === 'image_url')
  );
  
  if (hasImages && !supportsVision) {
    const visionModels = modelRouter.getAllModels()
      .filter(m => modelRouter.supportsVision(m));
    throw new Error(`Images not supported by ${modelName}. Try: ${visionModels.join(', ')}`);
  }
  
  return true;
};

// Chat completion validation rules
export const validateChatCompletion: ValidationChain[] = [
  // Model validation using existing router
  body('model')
    .isString()
    .notEmpty()
    .withMessage('Model is required')
    .custom((modelName) => {
      const validation = modelRouter.validateModel(modelName);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid model');
      }
      return true;
    }),

  // Messages validation
  body('messages')
    .isArray({ min: 1 })
    .withMessage('At least one message is required')
    .custom((messages) => {
      const limits = getValidationLimits();
      if (messages.length > limits.maxMessages) {
        throw new Error(`Too many messages. Maximum allowed: ${limits.maxMessages}`);
      }
      return true;
    })
    .custom(validateVisionContent),

  // Message structure validation
  body('messages.*.role')
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Invalid message role. Must be user, assistant, or system'),

  body('messages.*.content')
    .custom((content) => {
      const limits = getValidationLimits();
      
      if (typeof content === 'string') {
        if (!content.trim()) {
          throw new Error('Message content cannot be empty');
        }
        if (content.length > limits.maxContentLength) {
          throw new Error(`Message content too long. Maximum: ${limits.maxContentLength} characters`);
        }
      } else if (Array.isArray(content)) {
        // Validate content array format
        for (const item of content) {
          if (!item.type || !['text', 'image_url'].includes(item.type)) {
            throw new Error('Invalid content item type. Must be text or image_url');
          }
          if (item.type === 'text' && (!item.text || typeof item.text !== 'string')) {
            throw new Error('Text content item must have text property');
          }
          if (item.type === 'image_url' && (!item.image_url || !item.image_url.url)) {
            throw new Error('Image content item must have image_url.url property');
          }
        }
      } else {
        throw new Error('Message content must be string or array');
      }
      return true;
    }),

  // Optional parameters with model-aware validation
  body('max_tokens')
    .optional()
    .isInt({ min: 1 })
    .withMessage('max_tokens must be a positive integer')
    .custom(validateMaxTokens),

  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('temperature must be between 0 and 2'),

  body('stream')
    .optional()
    .isBoolean()
    .withMessage('stream must be boolean'),

  body('top_p')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('top_p must be between 0 and 1'),

  body('frequency_penalty')
    .optional()
    .isFloat({ min: -2, max: 2 })
    .withMessage('frequency_penalty must be between -2 and 2'),

  body('presence_penalty')
    .optional()
    .isFloat({ min: -2, max: 2 })
    .withMessage('presence_penalty must be between -2 and 2'),
];

// Validation error handler
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => error.msg);
    
    SecureLogger.logSecurityEvent('Validation failure', `${errorMessages.length} errors from ${req.ip}`);
    
    return res.status(400).json({
      error: {
        message: 'Request validation failed',
        type: 'validation_error',
        details: errorMessages
      }
    });
  }
  
  next();
};

// Basic input sanitization
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Remove any null bytes from string inputs (security measure)
  const sanitizeValue = (value: any): any => {
    if (typeof value === 'string') {
      return value.replace(/\0/g, '');
    }
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = sanitizeValue(val);
      }
      return sanitized;
    }
    return value;
  };

  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  next();
};

// Content-length validation
export const validateContentLength = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = req.get('content-length');
  const maxSize = parseInt(process.env.MAX_REQUEST_SIZE || '52428800', 10); // 50MB default
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    SecureLogger.logSecurityEvent('Large request blocked', `${contentLength} bytes from ${req.ip}`);
    return res.status(413).json({
      error: {
        message: 'Request too large',
        type: 'payload_too_large_error'
      }
    });
  }
  
  next();
};