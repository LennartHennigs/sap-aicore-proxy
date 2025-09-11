import fs from 'fs';
import path from 'path';

export interface ModelConfig {
  deploymentId: string;
  provider: string;
  supportsStreaming: boolean;
  supportsVision?: boolean;
  apiType: 'provider' | 'direct';
  endpoint?: string;
  requestFormat?: string;
  anthropic_version?: string;
  max_tokens?: number;
  description: string;
}

export interface ModelsConfiguration {
  comment: string;
  models: Record<string, ModelConfig>;
  providerSupportedModels: string[];
  directApiModels: string[];
}

class ModelRouter {
  private config!: ModelsConfiguration; // Definite assignment assertion since loadConfiguration() is called in constructor
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'models.json');
    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configData);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load model configuration from ${this.configPath}: ${errorMessage}`);
    }
  }

  getModelConfig(modelName: string): ModelConfig | null {
    return this.config.models[modelName] || null;
  }

  isProviderSupported(modelName: string): boolean {
    return this.config.providerSupportedModels.includes(modelName);
  }

  isDirectApiModel(modelName: string): boolean {
    return this.config.directApiModels.includes(modelName);
  }

  useDirectAPI(modelName: string): boolean {
    return !this.isProviderSupported(modelName);
  }

  getAllModels(): string[] {
    return Object.keys(this.config.models);
  }

  getProviderSupportedModels(): string[] {
    return [...this.config.providerSupportedModels];
  }

  getDirectApiModels(): string[] {
    return [...this.config.directApiModels];
  }

  supportsVision(modelName: string): boolean {
    const modelConfig = this.getModelConfig(modelName);
    return modelConfig?.supportsVision || false;
  }

  validateModel(modelName: string): { isValid: boolean; error?: string } {
    const modelConfig = this.getModelConfig(modelName);
    
    if (!modelConfig) {
      return {
        isValid: false,
        error: `Model '${modelName}' not found in configuration. Available models: ${this.getAllModels().join(', ')}`
      };
    }

    // Validate required fields
    if (!modelConfig.deploymentId) {
      return {
        isValid: false,
        error: `Model '${modelName}' is missing deploymentId in configuration`
      };
    }

    if (!modelConfig.provider) {
      return {
        isValid: false,
        error: `Model '${modelName}' is missing provider in configuration`
      };
    }

    if (!modelConfig.apiType) {
      return {
        isValid: false,
        error: `Model '${modelName}' is missing apiType in configuration`
      };
    }

    // Validate deployment ID format (should be alphanumeric)
    if (!/^[a-zA-Z0-9]+$/.test(modelConfig.deploymentId)) {
      return {
        isValid: false,
        error: `Model '${modelName}' has invalid deploymentId format. Should be alphanumeric.`
      };
    }

    // Validate API type
    if (!['provider', 'direct'].includes(modelConfig.apiType)) {
      return {
        isValid: false,
        error: `Model '${modelName}' has invalid apiType. Must be 'provider' or 'direct'.`
      };
    }

    // Validate direct API models have required endpoint
    if (modelConfig.apiType === 'direct' && !modelConfig.endpoint) {
      return {
        isValid: false,
        error: `Direct API model '${modelName}' is missing endpoint configuration`
      };
    }

    return { isValid: true };
  }

  validateAllModels(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const allModels = this.getAllModels();
    
    for (const modelName of allModels) {
      const validation = this.validateModel(modelName);
      if (!validation.isValid && validation.error) {
        errors.push(validation.error);
      }
    }
    
    // Validate that provider/direct arrays are consistent with model configurations
    for (const providerModel of this.config.providerSupportedModels) {
      const modelConfig = this.getModelConfig(providerModel);
      if (!modelConfig) {
        errors.push(`Provider model '${providerModel}' listed in providerSupportedModels but not found in models configuration`);
      } else if (modelConfig.apiType !== 'provider') {
        errors.push(`Model '${providerModel}' is in providerSupportedModels but has apiType '${modelConfig.apiType}' instead of 'provider'`);
      }
    }
    
    for (const directModel of this.config.directApiModels) {
      const modelConfig = this.getModelConfig(directModel);
      if (!modelConfig) {
        errors.push(`Direct API model '${directModel}' listed in directApiModels but not found in models configuration`);
      } else if (modelConfig.apiType !== 'direct') {
        errors.push(`Model '${directModel}' is in directApiModels but has apiType '${modelConfig.apiType}' instead of 'direct'`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  reloadConfiguration(): void {
    this.loadConfiguration();
  }
}

export const modelRouter = new ModelRouter();
