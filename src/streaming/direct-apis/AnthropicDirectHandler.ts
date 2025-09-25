import { SecureLogger } from '../../utils/secure-logger.js';

export interface StreamChunk {
  delta: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finished: boolean;
}

export interface DirectApiResponse {
  success: boolean;
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class AnthropicDirectHandler {
  private readonly baseUrl = 'https://api.anthropic.com/v1/messages';
  private readonly apiVersion = '2023-06-01';

  /**
   * Stream response from Anthropic's direct API
   */
  async *streamResponse(messages: any[]): AsyncIterable<StreamChunk> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for direct API access');
    }

    try {
      const requestBody = this.buildAnthropicRequest(messages, true);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': this.apiVersion,
          'anthropic-beta': 'messages-2023-12-15'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available for streaming');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Send final chunk
            yield {
              delta: '',
              finished: true
            };
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                yield {
                  delta: '',
                  finished: true
                };
                return;
              }

              try {
                const parsed = JSON.parse(data);
                
                if (parsed.type === 'content_block_delta') {
                  const delta = parsed.delta?.text || '';
                  if (delta) {
                    yield {
                      delta,
                      finished: false
                    };
                  }
                } else if (parsed.type === 'message_stop') {
                  yield {
                    delta: '',
                    usage: this.extractUsage(parsed),
                    finished: true
                  };
                  return;
                }
              } catch (parseError) {
                SecureLogger.logDebug(`Failed to parse Anthropic streaming data: ${parseError}`);
                continue;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecureLogger.logError('Anthropic direct API streaming', error);
      throw new Error(`Anthropic direct API streaming failed: ${errorMessage}`);
    }
  }

  /**
   * Non-streaming response from Anthropic's direct API
   */
  async callDirectApi(messages: any[]): Promise<DirectApiResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for direct API access');
    }

    try {
      const requestBody = this.buildAnthropicRequest(messages, false);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': this.apiVersion
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        text: result.content?.[0]?.text || 'No response',
        usage: {
          promptTokens: result.usage?.input_tokens || 0,
          completionTokens: result.usage?.output_tokens || 0,
          totalTokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0)
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecureLogger.logError('Anthropic direct API', error);
      throw new Error(`Anthropic direct API failed: ${errorMessage}`);
    }
  }

  /**
   * Build Anthropic-compatible request body
   */
  private buildAnthropicRequest(messages: any[], stream: boolean): any {
    // Separate system and non-system messages
    const systemMessages = messages.filter((msg: any) => msg.role === 'system');
    const nonSystemMessages = messages.filter((msg: any) => msg.role !== 'system');
    
    const requestBody: any = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      stream,
      messages: nonSystemMessages.map((msg: any) => ({
        role: msg.role,
        content: this.formatContent(msg.content)
      }))
    };

    // Add system message if present
    if (systemMessages.length > 0) {
      requestBody.system = typeof systemMessages[0].content === 'string' 
        ? systemMessages[0].content 
        : this.formatContent(systemMessages[0].content);
    }

    return requestBody;
  }

  /**
   * Format content for Anthropic API
   */
  private formatContent(content: any): any {
    if (typeof content === 'string') {
      return content;
    }
    
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
            const match = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
            if (match) {
              const [, mediaType, base64Data] = match;
              
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
          
          return { type: 'text', text: '[Image content - format not supported]' };
        }
        
        return { type: 'text', text: JSON.stringify(item) };
      });
    }
    
    return JSON.stringify(content);
  }

  /**
   * Extract usage information from response
   */
  private extractUsage(data: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
    const usage = data.usage || {};
    const promptTokens = usage.input_tokens || 0;
    const completionTokens = usage.output_tokens || 0;
    
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }

  /**
   * Check if direct API is available
   */
  static isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Get required environment variables
   */
  static getRequiredEnvVars(): string[] {
    return ['ANTHROPIC_API_KEY'];
  }
}

export const anthropicDirectHandler = new AnthropicDirectHandler();
