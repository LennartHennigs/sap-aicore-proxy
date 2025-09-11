import { tokenManager } from '../auth/token-manager.js';
import { modelRouter, type ModelConfig } from '../models/model-router.js';
import { config } from '../config/app-config.js';
import { ModelStrategyFactory } from '../strategies/ModelStrategyFactory.js';
import type { DirectApiResponse } from '../strategies/ModelStrategy.js';

// Re-export for backward compatibility
export type { DirectApiResponse };

export class DirectApiHandler {
  async callDirectAPI(modelName: string, messages: any[], stream: boolean = false): Promise<DirectApiResponse> {
    const modelConfig = modelRouter.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model ${modelName} not found in configuration`);
    }

    const token = await tokenManager.getAccessToken();
    
    const { deploymentUrl, requestBody } = this.buildRequest(modelConfig, messages);
    
    const response = await fetch(deploymentUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'AI-Resource-Group': 'default'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SAP AI Core API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    
    return this.parseResponse(modelConfig, result);
  }

  private buildRequest(modelConfig: ModelConfig, messages: any[]): { deploymentUrl: string; requestBody: any } {
    const baseUrl = `${config.aicore.baseUrl}/v2/inference/deployments/${modelConfig.deploymentId}`;
    
    // Use strategy pattern to handle different model formats
    const strategy = ModelStrategyFactory.create(modelConfig.requestFormat);
    
    return strategy.buildRequest(baseUrl, modelConfig, messages);
  }


  private parseResponse(modelConfig: ModelConfig, result: any): DirectApiResponse {
    // Use strategy pattern to handle different response formats
    const strategy = ModelStrategyFactory.create(modelConfig.requestFormat);
    
    return strategy.parseResponse(result);
  }
}

export const directApiHandler = new DirectApiHandler();
