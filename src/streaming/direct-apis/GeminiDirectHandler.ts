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

export class GeminiDirectHandler {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  private readonly model = 'gemini-1.5-flash';

  /**
   * Stream response from Google's Gemini direct API
   */
  async *streamResponse(messages: any[]): AsyncIterable<StreamChunk> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY environment variable is required for direct API access');
    }

    try {
      const requestBody = this.buildGeminiRequest(messages, true);
      const url = `${this.baseUrl}/${this.model}:streamGenerateContent?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
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
            
            // Gemini streaming returns JSON objects separated by newlines
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.candidates && parsed.candidates.length > 0) {
                const candidate = parsed.candidates[0];
                
                if (candidate.content && candidate.content.parts) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      yield {
                        delta: part.text,
                        finished: false
                      };
                    }
                  }
                }
                
                // Check if this is the final chunk
                if (candidate.finishReason) {
                  yield {
                    delta: '',
                    usage: this.extractUsage(parsed),
                    finished: true
                  };
                  return;
                }
              }
            } catch (parseError) {
              SecureLogger.logDebug(`Failed to parse Gemini streaming data: ${parseError}`);
              continue;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecureLogger.logError('Gemini direct API streaming', error);
      throw new Error(`Gemini direct API streaming failed: ${errorMessage}`);
    }
  }

  /**
   * Non-streaming response from Google's Gemini direct API
   */
  async callDirectApi(messages: any[]): Promise<DirectApiResponse> {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY environment variable is required for direct API access');
    }

    try {
      const requestBody = this.buildGeminiRequest(messages, false);
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      let text = 'No response';
      if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          text = candidate.content.parts[0].text || 'No response';
        }
      }
      
      return {
        success: true,
        text,
        usage: {
          promptTokens: result.usageMetadata?.promptTokenCount || 0,
          completionTokens: result.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: result.usageMetadata?.totalTokenCount || 0
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      SecureLogger.logError('Gemini direct API', error);
      throw new Error(`Gemini direct API failed: ${errorMessage}`);
    }
  }

  /**
   * Build Gemini-compatible request body
   */
  private buildGeminiRequest(messages: any[], stream: boolean): any {
    // Convert messages to Gemini format
    const contents: any[] = [];
    
    for (const message of messages) {
      if (message.role === 'system') {
        // System messages are handled differently in Gemini
        // We'll prepend them to the first user message
        continue;
      }
      
      const role = message.role === 'assistant' ? 'model' : 'user';
      const parts = this.formatContent(message.content);
      
      contents.push({
        role,
        parts
      });
    }
    
    // Add system message as instruction if present
    const systemMessage = messages.find((msg: any) => msg.role === 'system');
    let systemInstruction;
    if (systemMessage) {
      systemInstruction = {
        parts: [{ text: typeof systemMessage.content === 'string' ? systemMessage.content : JSON.stringify(systemMessage.content) }]
      };
    }

    const requestBody: any = {
      contents,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }

    return requestBody;
  }

  /**
   * Format content for Gemini API
   */
  private formatContent(content: any): any[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }
    
    if (Array.isArray(content)) {
      const parts: any[] = [];
      
      for (const item of content) {
        if (typeof item === 'string') {
          parts.push({ text: item });
        } else if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url') {
          // Convert OpenAI image_url format to Gemini format
          const imageUrl = item.image_url?.url || item.image_url;
          
          if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
            const match = imageUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
            if (match) {
              const [, mimeType, base64Data] = match;
              
              parts.push({
                inlineData: {
                  mimeType: `image/${mimeType}`,
                  data: base64Data
                }
              });
            } else {
              parts.push({ text: '[Image content - format not supported]' });
            }
          } else {
            parts.push({ text: '[Image content - format not supported]' });
          }
        } else {
          parts.push({ text: JSON.stringify(item) });
        }
      }
      
      return parts;
    }
    
    return [{ text: JSON.stringify(content) }];
  }

  /**
   * Extract usage information from response
   */
  private extractUsage(data: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
    const usage = data.usageMetadata || {};
    const promptTokens = usage.promptTokenCount || 0;
    const completionTokens = usage.candidatesTokenCount || 0;
    
    return {
      promptTokens,
      completionTokens,
      totalTokens: usage.totalTokenCount || (promptTokens + completionTokens)
    };
  }

  /**
   * Check if direct API is available
   */
  static isAvailable(): boolean {
    return !!process.env.GOOGLE_AI_API_KEY;
  }

  /**
   * Get required environment variables
   */
  static getRequiredEnvVars(): string[] {
    return ['GOOGLE_AI_API_KEY'];
  }
}

export const geminiDirectHandler = new GeminiDirectHandler();
