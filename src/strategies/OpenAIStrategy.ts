import type { ModelConfig } from '../models/model-router.js';
import type { ModelStrategy, RequestData, DirectApiResponse } from './ModelStrategy.js';
import { config } from '../config/app-config.js';

export class OpenAIStrategy implements ModelStrategy {
  getName(): string {
    return 'OpenAIStrategy';
  }

  buildRequest(baseUrl: string, modelConfig: ModelConfig, messages: any[]): RequestData {
    // For provider models like gpt-5-nano, use the correct SAP AI Core endpoint
    const deploymentUrl = `${baseUrl}/chat/completions?api-version=2023-05-15`;
    
    const requestBody = {
      messages: messages,
      max_completion_tokens: modelConfig.max_tokens || config.models.defaultMaxTokens,
      stream: false,
      temperature: 0.7
    };

    return { deploymentUrl, requestBody };
  }

  parseResponse(result: any): DirectApiResponse {
    // Generic OpenAI-compatible format
    const content = result.choices?.[0]?.message?.content || result.text || 'No response';
    
    return {
      success: true,
      text: content,
      usage: {
        promptTokens: result.usage?.prompt_tokens || 0,
        completionTokens: result.usage?.completion_tokens || 0,
        totalTokens: result.usage?.total_tokens || 0
      }
    };
  }

  formatContent(content: any): any {
    // OpenAI format is used as-is, no conversion needed
    // This strategy handles provider models that accept OpenAI format directly
    return content;
  }
}
