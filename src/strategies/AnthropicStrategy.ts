import type { ModelConfig } from '../models/model-router.js';
import type { ModelStrategy, RequestData, DirectApiResponse } from './ModelStrategy.js';
import { config } from '../config/app-config.js';

export class AnthropicStrategy implements ModelStrategy {
  getName(): string {
    return 'AnthropicStrategy';
  }

  buildRequest(baseUrl: string, modelConfig: ModelConfig, messages: any[]): RequestData {
    const deploymentUrl = `${baseUrl}${modelConfig.endpoint || config.models.defaults.anthropic.endpoint}`;
    
    // Separate system and non-system messages for Claude API
    const systemMessages = messages.filter((msg: any) => msg.role === 'system');
    const nonSystemMessages = messages.filter((msg: any) => msg.role !== 'system');
    
    const requestBody = {
      anthropic_version: modelConfig.anthropic_version || config.models.defaults.anthropic.version,
      max_tokens: modelConfig.max_tokens || config.models.defaultMaxTokens,
      // System messages go in top-level system parameter
      ...(systemMessages.length > 0 && { 
        system: typeof systemMessages[0].content === 'string' 
          ? systemMessages[0].content 
          : this.formatContent(systemMessages[0].content)
      }),
      // Only user/assistant messages in messages array with proper content formatting
      messages: nonSystemMessages.map((msg: any) => ({
        role: msg.role,
        content: this.formatContent(msg.content)
      }))
    };

    return { deploymentUrl, requestBody };
  }

  parseResponse(result: any): DirectApiResponse {
    const content = result.content?.[0]?.text || result.message?.content || 'No response';
    
    return {
      success: true,
      text: content,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    };
  }

  formatContent(content: any): any {
    // Handle string content
    if (typeof content === 'string') {
      return content;
    }
    
    // Handle array content (OpenAI format with images)
    if (Array.isArray(content)) {
      return content.map((item: any) => {
        if (typeof item === 'string') {
          return { type: 'text', text: item };
        }
        
        if (item.type === 'text') {
          return { type: 'text', text: item.text };
        }
        
        if (item.type === 'image_url') {
          // Convert OpenAI image_url format to Anthropic format
          const imageUrl = item.image_url?.url || item.image_url;
          
          if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
            // Extract media type and base64 data
            const match = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
            if (match) {
              const [, mediaType, base64Data] = match;
              
              if (base64Data) {
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: `image/${mediaType}`,
                    data: base64Data
                  }
                };
              }
            }
          }
          
          // Fallback to text if image format is not recognized
          return { type: 'text', text: '[Image content - format not supported]' };
        }
        
        // Convert other content types to text
        return { type: 'text', text: JSON.stringify(item) };
      });
    }
    
    // Fallback for other content types
    return JSON.stringify(content);
  }
}
