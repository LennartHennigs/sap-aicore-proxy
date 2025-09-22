import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/app-config.js';
import { modelRouter } from './models/model-router.js';
import { directApiHandler } from './handlers/direct-api-handler.js';
import { openaiHandler } from './handlers/openai-handler.js';
import { modelPool } from './handlers/model-pool.js';
import { SecureLogger } from './utils/secure-logger.js';
import { ApiKeyManager } from './auth/api-key-manager.js';
import { authenticateApiKey, addApiKeyHeaders } from './middleware/auth.js';
import { 
  validateChatCompletion, 
  handleValidationErrors, 
  sanitizeInput, 
  validateContentLength 
} from './middleware/validation.js';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Configure CORS
app.use(cors({
  origin: config.cors.origin,
  methods: config.cors.methods,
  allowedHeaders: config.cors.allowedHeaders
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // 100 requests per window
  message: {
    error: {
      message: 'Too many requests, please try again later',
      type: 'rate_limit_error'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    SecureLogger.logRateLimitHit(req.ip, req.path);
    res.status(429).json({
      error: {
        message: 'Too many requests, please try again later',
        type: 'rate_limit_error'
      }
    });
  }
});

// Stricter rate limiting for AI completion endpoints
const aiLimiter = rateLimit({
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS || '300000', 10), // 5 minutes
  max: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS || '20', 10), // 20 AI requests per window
  message: {
    error: {
      message: 'AI request rate limit exceeded, please try again later',
      type: 'ai_rate_limit_error'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    SecureLogger.logRateLimitHit(req.ip, req.path);
    res.status(429).json({
      error: {
        message: 'AI request rate limit exceeded, please try again later',
        type: 'ai_rate_limit_error'
      }
    });
  }
});

// Initialize API key system early
try {
  ApiKeyManager.initialize();
  console.log('🔐 API key system initialized');
} catch (error) {
  console.error('❌ Failed to initialize API key system:', error);
  process.exit(1);
}

// Apply authentication (before rate limiting but after CORS)
app.use(authenticateApiKey);
app.use(addApiKeyHeaders);

// Apply rate limiting
app.use(generalLimiter);
app.use('/v1/chat/completions', aiLimiter);

// Configure body parsers with increased limits for file uploads
app.use(express.json({ 
  limit: config.server.bodyLimit.json,
  verify: (req, res, buf) => {
    // Store raw body for potential debugging
    (req as any).rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  limit: config.server.bodyLimit.urlencoded,
  extended: true 
}));

app.use(express.raw({ 
  limit: config.server.bodyLimit.raw,
  type: ['application/octet-stream', 'multipart/form-data']
}));

// Enhanced error handling middleware for payload size errors
app.use((error: any, req: any, res: any, next: any) => {
  if (error.type === 'entity.too.large') {
    console.error(`❌ Payload too large: ${error.message}`);
    return res.status(413).json({
      error: {
        message: `Request payload too large. Maximum allowed size is ${config.server.bodyLimit.json} for JSON requests.`,
        type: 'payload_too_large_error',
        details: {
          maxSize: config.server.bodyLimit.json,
          receivedSize: error.length || 'unknown'
        }
      }
    });
  }
  
  if (error.type === 'entity.parse.failed') {
    console.error(`❌ JSON parse error: ${error.message}`);
    return res.status(400).json({
      error: {
        message: 'Invalid JSON format in request body',
        type: 'json_parse_error'
      }
    });
  }
  
  next(error);
});

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', 
  validateContentLength,
  sanitizeInput,
  validateChatCompletion,
  handleValidationErrors,
  async (req, res) => {
  try {
    const { messages, max_tokens, temperature, stream, model = config.models.defaultModel } = req.body;
    
    // Check if model supports vision using configuration
    const supportsVision = modelRouter.supportsVision(model);

    // Process messages to extract file content properly
    const processedMessages = messages.map(msg => {
      if (Array.isArray(msg.content)) {
        // Handle OpenAI-style content array format
        if (supportsVision) {
          // For vision models, preserve the array structure for images
          const processedContent = msg.content.map((contentItem: any) => {
            if (contentItem.type === 'image_url') {
              return contentItem; // Keep image_url format for vision models
            } else if (contentItem.type === 'file' || contentItem.type === 'document') {
              // Check if it's an image file
              if (contentItem.content && contentItem.content.startsWith('data:image/')) {
                return {
                  type: 'image_url',
                  image_url: {
                    url: contentItem.content
                  }
                };
              }
            }
            return contentItem;
          });
          
          return {
            ...msg,
            content: processedContent
          };
        } else {
          // For non-vision models, convert to text
          let textContent = '';
          
          for (const contentItem of msg.content) {
            if (contentItem.type === 'text') {
              textContent += contentItem.text + '\n';
            } else if (contentItem.type === 'image_url') {
              const visionModels = modelRouter.getAllModels().filter(m => modelRouter.supportsVision(m));
              textContent += `[Image uploaded - this model cannot process images. Please use a vision-capable model: ${visionModels.join(', ')}]\n`;
            } else if (contentItem.type === 'file' || contentItem.type === 'document') {
              // Handle file content
              if (contentItem.text) {
                textContent += `File Content:\n${contentItem.text}\n`;
              } else if (contentItem.content) {
                if (contentItem.content.startsWith('data:image/')) {
                  const visionModels = modelRouter.getAllModels().filter(m => modelRouter.supportsVision(m));
                  textContent += `[Image uploaded - this model cannot process images. Please use a vision-capable model: ${visionModels.join(', ')}]\n`;
                } else {
                  textContent += `File Content:\n${contentItem.content}\n`;
                }
              }
            }
          }
          
          return {
            ...msg,
            content: textContent.trim()
          };
        }
      } else if (typeof msg.content === 'string' && msg.content.includes('[content]')) {
        // Handle placeholder content - try to extract from raw body
        const rawBody = (req as any).rawBody;
        if (rawBody) {
          try {
            const rawString = rawBody.toString();
            
            // Look for base64 image data
            const base64ImageMatch = rawString.match(/data:image\/[^;]+;base64,([A-Za-z0-9+\/=]+)/);
            if (base64ImageMatch && supportsVision) {
              // Validate base64 image data
              const imageDataUrl = base64ImageMatch[0];
              const base64Data = base64ImageMatch[1];
              
              return {
                ...msg,
                content: [
                  {
                    type: 'text',
                    text: msg.content.replace(/\[content\]/g, 'Please analyze this image:')
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageDataUrl // Use the full match including data:image/...
                    }
                  }
                ]
              };
            } else if (base64ImageMatch && !supportsVision) {
              const visionModels = modelRouter.getAllModels().filter(m => modelRouter.supportsVision(m));
              return {
                ...msg,
                content: msg.content.replace(/\[content\]/g, `[Image uploaded - this model cannot process images. Please use a vision-capable model: ${visionModels.join(', ')}]`)
              };
            }
            
            // Look for other file content patterns - try multiple approaches
            let extractedContent = null;
            
            // Try to find actual file content in various formats
            const patterns = [
              /"text":\s*"([^"]+)"/,
              /"content":\s*"([^"]+)"/,
              /"data":\s*"([^"]+)"/,
              /content['"]\s*:\s*['"]([^'"]+)['"]/
            ];
            
            for (const pattern of patterns) {
              const match = rawString.match(pattern);
              if (match && match[1] && match[1] !== '[content]' && match[1].length > 10) {
                extractedContent = match[1];
                break;
              }
            }
            
            if (extractedContent) {
              return {
                ...msg,
                content: msg.content.replace(/\[content\]/g, extractedContent)
              };
            } else {
              return {
                ...msg,
                content: msg.content.replace(/\[content\]/g, '[File content could not be extracted - please try uploading again]')
              };
            }
          } catch (error) {
            // Silent error handling
          }
        }
        
        return msg;
      }
      
      return msg;
    });

    
    // Validate model
    const validation = modelRouter.validateModel(model);
    if (!validation.isValid) {
      return res.status(400).json({
        error: {
          message: validation.error,
          type: 'invalid_request_error'
        }
      });
    }

    const modelConfig = modelRouter.getModelConfig(model);
    const responseId = `chatcmpl-${Date.now()}`;
    const responseCreated = Math.floor(Date.now() / 1000);

    // Handle streaming requests
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      try {
        // Check if model supports true streaming
        if (modelConfig?.supportsStreaming && !modelRouter.useDirectAPI(model)) {
          // True streaming for provider API models
          let isFirstChunk = true;
          
          for await (const chunk of openaiHandler.streamProviderAPI(model, processedMessages)) {
            if (chunk.finished) {
              // Send final chunk with usage info
              const finalChunk = {
                id: responseId,
                object: 'chat.completion.chunk',
                created: responseCreated,
                model: model,
                choices: [{
                  index: 0,
                  delta: {},
                  finish_reason: 'stop'
                }],
                usage: chunk.usage ? {
                  prompt_tokens: chunk.usage.promptTokens,
                  completion_tokens: chunk.usage.completionTokens,
                  total_tokens: chunk.usage.totalTokens
                } : undefined
              };
              
              res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
              break;
            } else {
              // Send streaming chunk
              const streamChunk = {
                id: responseId,
                object: 'chat.completion.chunk',
                created: responseCreated,
                model: model,
                choices: [{
                  index: 0,
                  delta: isFirstChunk ? {
                    role: 'assistant',
                    content: chunk.delta
                  } : {
                    content: chunk.delta
                  },
                  finish_reason: null
                }]
              };
              
              res.write(`data: ${JSON.stringify(streamChunk)}\n\n`);
              isFirstChunk = false;
            }
          }
          
          res.write('data: [DONE]\n\n');
          res.end();
          
        } else {
          // Fallback to mock streaming for non-streaming models
          
          let result;
          if (modelRouter.useDirectAPI(model)) {
            result = await directApiHandler.callDirectAPI(model, processedMessages, false);
          } else {
            result = await openaiHandler.callProviderAPI(model, processedMessages);
          }

          // Send the complete response as a single chunk (mock streaming)
          const streamResponse = {
            id: responseId,
            object: 'chat.completion.chunk',
            created: responseCreated,
            model: model,
            choices: [{
              index: 0,
              delta: {
                role: 'assistant',
                content: result.text
              },
              finish_reason: null
            }]
          };

          res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);

          // Send completion chunk
          setTimeout(() => {
            res.write(`data: ${JSON.stringify({
              ...streamResponse,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }],
              usage: {
                prompt_tokens: result.usage?.promptTokens || 0,
                completion_tokens: result.usage?.completionTokens || 0,
                total_tokens: result.usage?.totalTokens || 0
              }
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }, 100);
        }
        
      } catch (error) {
        SecureLogger.logError('Streaming', error);
        const errorMessage = SecureLogger.sanitizeError(error);
        
        // Send error in SSE format
        const errorChunk = {
          id: responseId,
          object: 'chat.completion.chunk',
          created: responseCreated,
          model: model,
          error: {
            message: `Streaming error: ${errorMessage}`,
            type: 'api_error'
          }
        };
        
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      
      return; // Exit early for streaming responses
    }

    // Handle non-streaming requests
    let result;
    
    if (modelRouter.useDirectAPI(model)) {
      try {
        result = await directApiHandler.callDirectAPI(model, processedMessages, false);
      } catch (error) {
        SecureLogger.logError('Direct API call', error);
        const errorMessage = SecureLogger.sanitizeError(error);
        return res.status(500).json({
          error: {
            message: `Direct API error: ${errorMessage}`,
            type: 'api_error'
          }
        });
      }
    } else {
      try {
        result = await openaiHandler.callProviderAPI(model, processedMessages);
      } catch (error) {
        SecureLogger.logError('Provider API call', error);
        const errorMessage = SecureLogger.sanitizeError(error);
        
        // Check if this is a vision processing failure and we have a vision-capable model
        const hasImages = processedMessages.some(msg => 
          Array.isArray(msg.content) && msg.content.some((item: any) => item.type === 'image_url')
        );
        
        if (hasImages && modelRouter.supportsVision(model) && errorMessage.includes('vision processing failed')) {
          try {
            // Try using direct API as fallback for vision requests
            result = await directApiHandler.callDirectAPI(model, processedMessages, false);
          } catch (fallbackError) {
            SecureLogger.logError('Direct API fallback', fallbackError);
            return res.status(500).json({
              error: {
                message: `Both Provider API and Direct API failed for vision request: ${errorMessage}`,
                type: 'api_error'
              }
            });
          }
        } else {
          return res.status(500).json({
            error: {
              message: `Provider API error: ${errorMessage}`,
              type: 'api_error'
            }
          });
        }
      }
    }

    // Format non-streaming response in OpenAI-compatible format
    const response = {
      id: responseId,
      object: 'chat.completion',
      created: responseCreated,
      model: model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: result.text
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: result.usage?.promptTokens || 0,
        completion_tokens: result.usage?.completionTokens || 0,
        total_tokens: result.usage?.totalTokens || 0
      }
    };

    res.json(response);

  } catch (error) {
    SecureLogger.logError('Proxy', error);
    res.status(500).json({
      error: {
        message: SecureLogger.sanitizeError(error),
        type: 'internal_error'
      }
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    models: {
      available: modelRouter.getAllModels(),
      providerSupported: modelRouter.getProviderSupportedModels(),
      directApi: modelRouter.getDirectApiModels()
    },
    modelPool: {
      stats: modelPool.getPoolStats(),
      poolSize: Object.keys(modelPool.getPoolStats()).length
    }
  });
});

// Models endpoint for discovery
app.get('/v1/models', (req, res) => {
  const models = modelRouter.getAllModels().map(modelName => {
    const config = modelRouter.getModelConfig(modelName);
    return {
      id: modelName,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: config?.provider || 'sap-aicore',
      permission: [],
      root: modelName,
      parent: null
    };
  });

  res.json({
    object: 'list',
    data: models
  });
});

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  SecureLogger.logServerStart(config.server.host, config.server.port);
  
  // Validate all model configurations on startup
  const validation = modelRouter.validateAllModels();
  if (!validation.isValid) {
    SecureLogger.logValidationFailure(validation.errors.length);
    validation.errors.forEach(error => console.error(`   • ${error}`));
  } else {
    SecureLogger.logValidationSuccess();
  }
  
  console.log(`📡 Configure your AI client with:`);
  console.log(`\x1b[1m\x1b[37m   • API Host: http://${config.server.host}:${config.server.port}\x1b[0m`);
  console.log(`\x1b[1m\x1b[37m   • API Path: /v1\x1b[0m`);
  console.log(`\x1b[1m\x1b[37m   • API Key: ${ApiKeyManager.getApiKey()}\x1b[0m`);
  console.log(`\x1b[1m\x1b[37m   • Available Models: ${modelRouter.getAllModels().join(', ')}\x1b[0m`);
  
  // Preload provider-supported models for better performance
  const providerModels = modelRouter.getProviderSupportedModels();
  if (providerModels.length > 0) {
    console.log(`🔄 Preloading provider models: ${providerModels.join(', ')}`);
    modelPool.preloadModels(providerModels);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  SecureLogger.logServerShutdown();
  modelPool.shutdown();
  server.close(() => {
    SecureLogger.logServerClosed();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  SecureLogger.logServerShutdown();
  modelPool.shutdown();
  server.close(() => {
    SecureLogger.logServerClosed();
    process.exit(0);
  });
});
