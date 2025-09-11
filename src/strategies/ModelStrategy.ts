import type { ModelConfig } from '../models/model-router.js';

export interface RequestData {
  deploymentUrl: string;
  requestBody: any;
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

export interface ModelStrategy {
  /**
   * Build the request for the specific model format
   */
  buildRequest(baseUrl: string, modelConfig: ModelConfig, messages: any[]): RequestData;
  
  /**
   * Parse the response from the specific model format
   */
  parseResponse(result: any): DirectApiResponse;
  
  /**
   * Format content for the specific model format
   */
  formatContent(content: any): any;
  
  /**
   * Get the strategy name for logging/debugging
   */
  getName(): string;
}
