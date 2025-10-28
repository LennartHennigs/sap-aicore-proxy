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
      let totalUsage: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Send final chunk with usage if available
            yield {
              delta: '',
              usage: totalUsage,
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
                  usage: totalUsage,
                  finished: true
                };
                return;
              }

              try {
                const parsed = JSON.parse(data);
                
                // Handle different event types according to Claude API docs
                if (parsed.type === 'message_start') {
                  // Initial message event - can extract initial usage info
                  if (parsed.message?.usage) {
                    totalUsage = this.extractUsage(parsed.message);
                  }
                } else if (parsed.type === 'content_block_delta') {
                  // Content delta events
                  if (parsed.delta?.type === 'text_delta') {
                    const delta = parsed.delta?.text || '';
                    if (delta) {
                      yield {
                        delta,
                        finished: false
                      };
                    }
                  }
                } else if (parsed.type === 'message_delta') {
                  // Message delta with final usage info
                  if (parsed.usage) {
                    totalUsage = this.extractUsage(parsed);
                  }
                } else if (parsed.type === 'message_stop') {
                  // Final message stop event
                  yield {
                    delta: '',
                    usage: totalUsage,
                    finished: true
                  };
                  return;
                }
              } catch (parseError) {
                SecureLogger.logDebug(`Failed to parse streaming data: ${data}`);
                continue;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      SecureLogger.logError('Anthropic streaming error', error);
      throw error;
    }
  }

  /**
   * Get a non-streaming response from Anthropic's direct API
   */
  async getResponse(messages: any[]): Promise<DirectApiResponse> {
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
          'anthropic-version': this.apiVersion,
          'anthropic-beta': 'messages-2023-12-15'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Convert Claude response to our standard format
      const text = data.content?.[0]?.text || '';
      const usage = this.extractUsage(data);

      return {
        success: true,
        text,
        usage
      };
    } catch (error) {
      SecureLogger.logError('Anthropic direct API error', error);
      return {
        success: false,
        text: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      };
    }
  }

  /**
   * Build request body for Anthropic API
   */
  private buildAnthropicRequest(messages: any[], stream: boolean = false): any {
    // Convert messages to Claude format
    const claudeMessages = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : this.formatContent(msg.content)
      }));

    // Extract system message if present
    const systemMessage = messages.find(msg => msg.role === 'system');

    const request: any = {
      model: 'claude-3-sonnet-20240229', // Default model, can be overridden
      max_tokens: 4096,
      messages: claudeMessages,
      stream
    };

    if (systemMessage?.content) {
      request.system = systemMessage.content;
    }

    return request;
  }

  /**
   * Format mixed content for Claude API
   */
  private formatContent(content: any[]): any {
    if (!Array.isArray(content)) {
      return content;
    }

    return content.map(item => {
      if (item.type === 'text') {
        return { type: 'text', text: item.text };
      } else if (item.type === 'image_url') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: this.extractMediaType(item.image_url.url),
            data: this.extractBase64Data(item.image_url.url)
          }
        };
      }
      return item;
    });
  }

  /**
   * Extract media type from data URL
   */
  private extractMediaType(dataUrl: string): string {
    const match = dataUrl.match(/data:([^;]+);/);
    return match ? match[1] : 'image/jpeg';
  }

  /**
   * Extract base64 data from data URL
   */
  private extractBase64Data(dataUrl: string): string {
    const match = dataUrl.match(/base64,(.+)/);
    return match ? match[1] : '';
  }

  /**
   * Extract usage information from Claude response
   */
  private extractUsage(data: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
    const usage = data.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    
    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }

  /**
   * Check if Anthropic direct API is available
   */
  static isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}

// Export singleton instance
export const anthropicDirectHandler = new AnthropicDirectHandler();
