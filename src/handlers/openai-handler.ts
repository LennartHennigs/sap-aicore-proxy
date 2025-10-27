import { run } from '@openai/agents';
import { modelRouter } from '../models/model-router.js';
import { modelPool } from './model-pool.js';
import { config } from '../config/app-config.js';
import { responseValidator } from '../utils/response-validator.js';
import { SecureLogger } from '../utils/secure-logger.js';

export interface OpenAIResponse {
  success: boolean;
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  delta: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finished: boolean;
}

export class OpenAIHandler {
  async *streamProviderAPI(modelName: string, messages: any[]): AsyncIterable<StreamChunk> {
    const modelConfig = modelRouter.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model ${modelName} not found in configuration`);
    }

    if (!modelConfig.supportsStreaming) {
      throw new Error(`Model ${modelName} does not support streaming`);
    }

    try {
      // For vision models with images, fall back to non-streaming due to AI SDK compatibility issues
      if (modelConfig.supportsVision && this.hasImageContent(messages)) {
        const nonStreamingResult = await this.callProviderAPI(modelName, messages);
        
        // Simulate streaming by yielding the complete response
        yield {
          delta: nonStreamingResult.text,
          finished: false
        };
        
        yield {
          delta: '',
          usage: nonStreamingResult.usage,
          finished: true
        };
        return;
      }
      
      // Instead of using direct streaming (which has issues), simulate streaming 
      // by getting the full response and chunking it
      const result = await this.callProviderAPI(modelName, messages);
      
      // Simulate streaming by chunking the response
      const text = result.text;
      const chunkSize = 10; // Characters per chunk
      
      // Extract prompt for logging
      const prompt = this.extractPromptForLogging(messages);
      
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunkText = text.slice(i, i + chunkSize);
        const rawChunk = {
          delta: chunkText,
          finished: false
        };
        
        // Validate and correct the chunk before yielding
        const validation = responseValidator.validateStreamChunk(rawChunk, modelName, prompt);
        const chunkToYield = validation.corrected ? validation.correctedChunk! : rawChunk;
        
        if (validation.corrected) {
          SecureLogger.logDebug(`Stream chunk corrected for ${modelName}: ${validation.issues.join(', ')}`);
        }
        
        yield chunkToYield;
        
        // Add small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Send final chunk with usage info
      const finalChunk = {
        delta: '',
        usage: result.usage,
        finished: true
      };
      
      // Validate final chunk
      const finalValidation = responseValidator.validateStreamChunk(finalChunk, modelName, prompt);
      yield finalValidation.corrected ? finalValidation.correctedChunk! : finalChunk;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const prompt = this.extractPromptForLogging(messages);
      
      // Log the streaming API error with sanitized context
      SecureLogger.logError(
        'Provider API streaming call failed',
        error,
        `model: ${modelName}, prompt: "${prompt.substring(0, 100)}..."`
      );
      
      throw new Error(`Provider API streaming error: ${errorMessage}`);
    }
  }

  async callProviderAPI(modelName: string, messages: any[]): Promise<OpenAIResponse> {
    const modelConfig = modelRouter.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model ${modelName} not found in configuration`);
    }

    try {
      // Get pooled agent instance (reuses existing instances per model)
      const agent = await modelPool.getModel(modelName);
      
      // Extract prompt for logging and validation
      const prompt = this.extractPromptForLogging(messages);
      
      let response: OpenAIResponse;
      
      // For vision models, use the proper message format
      if (modelConfig.supportsVision && this.hasImageContent(messages)) {
        // Use proper vision message format for AI SDK
        try {
          const promptMessages = this.buildPromptFromMessages(messages);
          const result = await run(agent, promptMessages);
          
          // Check if the result indicates vision processing failed
          if (result.finalOutput && (
            result.finalOutput.includes("can't view") || 
            result.finalOutput.includes("cannot view") ||
            result.finalOutput.includes("can't actually view") ||
            result.finalOutput.includes("I don't see") ||
            result.finalOutput.includes("unable to see") ||
            result.finalOutput.includes("don't see the image") ||
            result.finalOutput.includes("re-upload it")
          )) {
            throw new Error('AI SDK vision processing failed - model cannot access image data');
          }
          
          response = {
            success: true,
            text: result.finalOutput || 'No response',
            usage: {
              promptTokens: 0, // run() doesn't provide detailed usage info
              completionTokens: 0,
              totalTokens: 0
            }
          };
        } catch (error) {
          // Check if this is an image data error that should trigger direct API fallback
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('Invalid image data') || errorMessage.includes('image')) {
            throw new Error('AI SDK vision processing failed - model cannot access image data');
          }
          
          // For other errors, fall back to text-only
          const textPrompt = this.extractPrompt(messages);
          const result = await run(agent, textPrompt);
          
          response = {
            success: true,
            text: result.finalOutput || 'No response',
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0
            }
          };
        }
      } else {
        // For text-only models, use simple prompt
        const textPrompt = this.extractPrompt(messages);
        const result = await run(agent, textPrompt);
        
        response = {
          success: true,
          text: result.finalOutput || 'No response',
          usage: {
            promptTokens: 0, // TODO: Extract from result if available
            completionTokens: 0,
            totalTokens: 0
          }
        };
      }

      // CRITICAL FIX: Validate and correct the response to prevent "Invalid API Response" errors
      // This was the missing piece causing Cline errors
      try {
        const validation = responseValidator.validateAndCorrectResponse(response, modelName, prompt);
        
        if (validation.corrected) {
          SecureLogger.logDebug(`OpenAI handler response corrected for ${modelName}: ${validation.issues.join(', ')}`);
          return validation.correctedResponse!;
        }
        
        if (!validation.isValid) {
          SecureLogger.logError(`OpenAI handler response validation failed for ${modelName}`, new Error(validation.issues.join(', ')));
          // Return corrected response even if validation flagged issues
          return validation.correctedResponse || response;
        }
        
        return response;
      } catch (validationError) {
        // If response validation completely fails, log the error but return the original response
        SecureLogger.logError(`OpenAI handler response validator threw error for ${modelName} (non-critical)`, validationError);
        return response;
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const prompt = this.extractPromptForLogging(messages);
      
      // Log the provider API error with sanitized context
      SecureLogger.logError(
        'Provider API call failed',
        error,
        `model: ${modelName}, prompt: "${prompt.substring(0, 100)}..."`
      );
      
      throw new Error(`Provider API error: ${errorMessage}`);
    }
  }

  private extractPrompt(messages: any[]): string {
    const lastMessage = messages[messages.length - 1];
    
    if (typeof lastMessage.content === 'string') {
      return lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
      // Handle array content format - extract text parts only for simple prompt
      return lastMessage.content.map((item: any) => {
        if (typeof item === 'string') return item;
        if (item.type === 'text') return item.text;
        if (item.type === 'image_url') return '[Image]';
        return '[content]';
      }).join(' ');
    } else {
      return JSON.stringify(lastMessage.content);
    }
  }

  /**
   * Extract prompt from messages for logging (similar to direct API handler)
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

  private hasImageContent(messages: any[]): boolean {
    return messages.some((message: any) => {
      if (Array.isArray(message.content)) {
        return message.content.some((item: any) => item.type === 'image_url');
      }
      return false;
    });
  }

  private buildPromptFromMessages(messages: any[]): any[] {
    // Convert messages to the format expected by the AI SDK
    return messages.map((message: any) => {
      if (message.role === 'system') {
        return {
          type: 'message',
          role: 'system',
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
        };
      }
      
      return {
        type: 'message',
        role: message.role,
        content: typeof message.content === 'string' 
          ? [{ type: 'input_text', text: message.content }]
          : Array.isArray(message.content)
            ? message.content.map((item: any) => {
                if (typeof item === 'string') return { type: 'input_text', text: item };
                if (item.type === 'text') return { type: 'input_text', text: item.text };
                if (item.type === 'image_url') {
                  // Convert OpenAI image_url format to AI SDK input_image format
                  const imageUrl = item.image_url?.url || item.image_url;
                  return { 
                    type: 'input_image', 
                    image: imageUrl 
                  };
                }
                return { type: 'input_text', text: '[content]' };
              })
            : [{ type: 'input_text', text: JSON.stringify(message.content) }]
      };
    });
  }
}

export const openaiHandler = new OpenAIHandler();
