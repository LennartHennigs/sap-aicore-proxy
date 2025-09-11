import { run } from '@openai/agents';
import { modelRouter } from '../models/model-router.js';
import { modelPool } from './model-pool.js';
import { config } from '../config/app-config.js';

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
      // Get pooled model instance for streaming
      const model = await modelPool.getModelForStreaming(modelName);
      
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
      
      // For text-only content, use streaming
      const input = this.extractPrompt(messages);
      
      // Use the AI SDK model's streaming capabilities
      const result = await model.getStreamedResponse({
        input: input,
        tools: [],
        handoffs: [],
        outputType: 'text',
        modelSettings: {
          maxCompletionTokens: modelConfig.max_tokens || config.models.defaultMaxTokens
        },
        systemInstructions: 'You are a helpful AI assistant.',
        tracing: false
      });

      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;

      for await (const event of result) {
        if (event.type === 'output_text_delta') {
          yield {
            delta: event.delta,
            finished: false
          };
        } else if (event.type === 'response_done') {
          totalPromptTokens = event.response.usage.inputTokens;
          totalCompletionTokens = event.response.usage.outputTokens;
          
          yield {
            delta: '',
            usage: {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens: totalPromptTokens + totalCompletionTokens
            },
            finished: true
          };
        }
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
          
          return {
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
          const prompt = this.extractPrompt(messages);
          const result = await run(agent, prompt);
          
          return {
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
        const prompt = this.extractPrompt(messages);
        const result = await run(agent, prompt);
        
        return {
          success: true,
          text: result.finalOutput || 'No response',
          usage: {
            promptTokens: 0, // TODO: Extract from result if available
            completionTokens: 0,
            totalTokens: 0
          }
        };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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
