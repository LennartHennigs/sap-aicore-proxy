import express from 'express';
import cors from 'cors';
import { config } from './config/app-config.js';
import { modelRouter } from './models/model-router.js';
import { directApiHandler } from './handlers/direct-api-handler.js';
import { openaiHandler } from './handlers/openai-handler.js';
import { modelPool } from './handlers/model-pool.js';

const app = express();

// Configure CORS
app.use(cors({
  origin: config.cors.origin,
  methods: config.cors.methods,
  allowedHeaders: config.cors.allowedHeaders
}));

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
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, max_tokens, temperature, stream, model = config.models.defaultModel } = req.body;
    
    // Input validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'Messages array is required and must not be empty',
          type: 'invalid_request_error'
        }
      });
    }
    
    if (typeof model !== 'string' || model.trim() === '') {
      return res.status(400).json({
        error: {
          message: 'Model must be a non-empty string',
          type: 'invalid_request_error'
        }
      });
    }
    
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
        console.error('❌ Streaming error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
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
        console.error('❌ Direct API call failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
        console.error('❌ Provider API call failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Check if this is a vision processing failure and we have a vision-capable model
        const hasImages = processedMessages.some(msg => 
          Array.isArray(msg.content) && msg.content.some((item: any) => item.type === 'image_url')
        );
        
        if (hasImages && modelRouter.supportsVision(model) && errorMessage.includes('vision processing failed')) {
          try {
            // Try using direct API as fallback for vision requests
            result = await directApiHandler.callDirectAPI(model, processedMessages, false);
          } catch (fallbackError) {
            console.error('❌ Direct API fallback also failed:', fallbackError);
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
    console.error('❌ Proxy error:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
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

// Claude native API endpoint - /v1/messages
app.post('/v1/messages', async (req, res) => {
  try {
    const { messages, max_tokens, temperature, stream, model, system } = req.body;
    
    // Input validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Messages array is required and must not be empty'
        }
      });
    }
    
    if (!model || typeof model !== 'string' || model.trim() === '') {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Model is required and must be a non-empty string'
        }
      });
    }

    // Convert Claude format to internal OpenAI format
    let processedMessages = [...messages];
    
    // Handle system message if provided
    if (system) {
      processedMessages.unshift({
        role: 'system',
        content: system
      });
    }

    // Validate model
    const validation = modelRouter.validateModel(model);
    if (!validation.isValid) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: validation.error
        }
      });
    }

    const responseId = `msg_${Date.now()}`;

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
        let result;
        if (modelRouter.useDirectAPI(model)) {
          result = await directApiHandler.callDirectAPI(model, processedMessages, false);
        } else {
          result = await openaiHandler.callProviderAPI(model, processedMessages);
        }

        // Send Claude-style streaming events
        const streamEvent = {
          type: 'message_start',
          message: {
            id: responseId,
            type: 'message',
            role: 'assistant',
            content: [],
            model: model,
            usage: { input_tokens: 0, output_tokens: 0 }
          }
        };
        res.write(`event: message_start\ndata: ${JSON.stringify(streamEvent)}\n\n`);

        const contentBlockStart = {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        };
        res.write(`event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`);

        const contentBlockDelta = {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: result.text }
        };
        res.write(`event: content_block_delta\ndata: ${JSON.stringify(contentBlockDelta)}\n\n`);

        const contentBlockStop = {
          type: 'content_block_stop',
          index: 0
        };
        res.write(`event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`);

        const messageStop = {
          type: 'message_delta',
          delta: { 
            stop_reason: 'end_turn',
            usage: {
              output_tokens: result.usage?.completionTokens || 0
            }
          },
          usage: {
            input_tokens: result.usage?.promptTokens || 0,
            output_tokens: result.usage?.completionTokens || 0
          }
        };
        res.write(`event: message_delta\ndata: ${JSON.stringify(messageStop)}\n\n`);

        const messageStopEvent = { type: 'message_stop' };
        res.write(`event: message_stop\ndata: ${JSON.stringify(messageStopEvent)}\n\n`);

        res.end();
      } catch (error) {
        console.error('❌ Claude streaming error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        const errorEvent = {
          type: 'error',
          error: {
            type: 'api_error',
            message: `Streaming error: ${errorMessage}`
          }
        };
        res.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
        res.end();
      }
      
      return;
    }

    // Handle non-streaming requests
    let result;
    
    if (modelRouter.useDirectAPI(model)) {
      try {
        result = await directApiHandler.callDirectAPI(model, processedMessages, false);
      } catch (error) {
        console.error('❌ Direct API call failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          error: {
            type: 'api_error',
            message: `Direct API error: ${errorMessage}`
          }
        });
      }
    } else {
      try {
        result = await openaiHandler.callProviderAPI(model, processedMessages);
      } catch (error) {
        console.error('❌ Provider API call failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          error: {
            type: 'api_error',
            message: `Provider API error: ${errorMessage}`
          }
        });
      }
    }

    // Format response in Claude-compatible format
    const response = {
      id: responseId,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: result.text
        }
      ],
      model: model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: result.usage?.promptTokens || 0,
        output_tokens: result.usage?.completionTokens || 0
      }
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Claude API error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Internal server error'
      }
    });
  }
});

// Gemini native API endpoint - /v1/models/{model}:generateContent
app.post('/v1/models/:model\\:generateContent', async (req, res) => {
  try {
    const { contents, generationConfig, systemInstruction } = req.body;
    const model = (req.params as any).model;
    
    // Input validation
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({
        error: {
          code: 400,
          message: 'Contents array is required and must not be empty',
          status: 'INVALID_ARGUMENT'
        }
      });
    }
    
    if (!model || typeof model !== 'string' || model.trim() === '') {
      return res.status(400).json({
        error: {
          code: 400,
          message: 'Model must be a non-empty string',
          status: 'INVALID_ARGUMENT'
        }
      });
    }

    // Convert Gemini format to internal OpenAI format
    const processedMessages = [];
    
    // Add system instruction if provided
    if (systemInstruction && systemInstruction.parts && systemInstruction.parts.length > 0) {
      const systemContent = systemInstruction.parts.map((part: any) => part.text).join('\n');
      processedMessages.push({
        role: 'system',
        content: systemContent
      });
    }

    // Convert contents to messages
    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : content.role;
      
      if (content.parts && content.parts.length > 0) {
        // Handle mixed content (text + images)
        if (content.parts.length === 1 && content.parts[0].text) {
          // Simple text message
          processedMessages.push({
            role: role,
            content: content.parts[0].text
          });
        } else {
          // Mixed content array
          const contentArray = content.parts.map((part: any) => {
            if (part.text) {
              return { type: 'text', text: part.text };
            } else if (part.inlineData || part.fileData) {
              // Handle image data
              const imageData = part.inlineData || part.fileData;
              const mimeType = imageData.mimeType || 'image/jpeg';
              const data = imageData.data;
              
              return {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${data}`
                }
              };
            }
            return { type: 'text', text: '[Unsupported content type]' };
          });
          
          processedMessages.push({
            role: role,
            content: contentArray
          });
        }
      }
    }

    // Validate model
    const validation = modelRouter.validateModel(model);
    if (!validation.isValid) {
      return res.status(400).json({
        error: {
          code: 400,
          message: validation.error,
          status: 'INVALID_ARGUMENT'
        }
      });
    }

    // Handle streaming (Gemini format)
    const isStreaming = req.query.alt === 'sse' || generationConfig?.stream === true;
    
    if (isStreaming) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      try {
        let result;
        if (modelRouter.useDirectAPI(model)) {
          result = await directApiHandler.callDirectAPI(model, processedMessages, false);
        } else {
          result = await openaiHandler.callProviderAPI(model, processedMessages);
        }

        // Send Gemini-style streaming response
        const streamResponse = {
          candidates: [{
            content: {
              parts: [{ text: result.text }],
              role: 'model'
            },
            finishReason: 'STOP',
            index: 0
          }],
          usageMetadata: {
            promptTokenCount: result.usage?.promptTokens || 0,
            candidatesTokenCount: result.usage?.completionTokens || 0,
            totalTokenCount: result.usage?.totalTokens || 0
          }
        };

        res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        console.error('❌ Gemini streaming error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        const errorResponse = {
          error: {
            code: 500,
            message: `Streaming error: ${errorMessage}`,
            status: 'INTERNAL'
          }
        };
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.end();
      }
      
      return;
    }

    // Handle non-streaming requests
    let result;
    
    if (modelRouter.useDirectAPI(model)) {
      try {
        result = await directApiHandler.callDirectAPI(model, processedMessages, false);
      } catch (error) {
        console.error('❌ Direct API call failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          error: {
            code: 500,
            message: `Direct API error: ${errorMessage}`,
            status: 'INTERNAL'
          }
        });
      }
    } else {
      try {
        result = await openaiHandler.callProviderAPI(model, processedMessages);
      } catch (error) {
        console.error('❌ Provider API call failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          error: {
            code: 500,
            message: `Provider API error: ${errorMessage}`,
            status: 'INTERNAL'
          }
        });
      }
    }

    // Format response in Gemini-compatible format
    const response = {
      candidates: [{
        content: {
          parts: [{ text: result.text }],
          role: 'model'
        },
        finishReason: 'STOP',
        index: 0,
        safetyRatings: []
      }],
      usageMetadata: {
        promptTokenCount: result.usage?.promptTokens || 0,
        candidatesTokenCount: result.usage?.completionTokens || 0,
        totalTokenCount: result.usage?.totalTokens || 0
      }
    };

    res.json(response);

  } catch (error) {
    console.error('❌ Gemini API error:', error);
    res.status(500).json({
      error: {
        code: 500,
        message: error instanceof Error ? error.message : 'Internal server error',
        status: 'INTERNAL'
      }
    });
  }
});

// Start server
const server = app.listen(config.server.port, config.server.host, async () => {
  console.log(`🚀 SAP AI Core proxy running at http://${config.server.host}:${config.server.port}`);
  
  // Validate all model configurations on startup
  try {
    const validation = await modelRouter.validateAllModels();
    if (!validation.isValid) {
      console.error('❌ Model configuration validation failed:');
      validation.errors.forEach(error => console.error(`   • ${error}`));
      console.error('⚠️ Server will continue but some models may not work correctly');
    } else {
      console.log('✅ All model configurations validated successfully');
    }
  } catch (error) {
    console.error('❌ Failed to validate model configurations:', error);
    console.error('⚠️ Server will continue but models may not work correctly');
  }
  
  console.log(`📡 Configure your AI client with:`);
  console.log(`   • API Host: http://${config.server.host}:${config.server.port}`);
  console.log(`   • API Path: /v1`);
  console.log(`   • API Key: any-string-works`);
  console.log(`   • Available Models: ${modelRouter.getAllModels().join(', ')}`);
  
  // Preload provider-supported models for better performance
  const providerModels = modelRouter.getProviderSupportedModels();
  if (providerModels.length > 0) {
    console.log(`🔄 Preloading provider models: ${providerModels.join(', ')}`);
    modelPool.preloadModels(providerModels);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  modelPool.shutdown();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  modelPool.shutdown();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
