import fs from 'fs';
import path from 'path';
import { deploymentDiscovery } from '../services/deployment-discovery';

export interface ModelConfig {
  deploymentId?: string;
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
  private deploymentIds: Map<string, string> = new Map(); // modelName -> deploymentId
  private initialized: boolean = false;

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
    const config = this.config.models[modelName];
    if (!config) return null;

    // Return a copy with the discovered deploymentId
    return {
      ...config,
      deploymentId: config.deploymentId || this.deploymentIds.get(modelName)
    };
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

    // Note: deploymentId validation moved to runtime discovery phase

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

    // Validate deployment ID format if present (should be alphanumeric)
    if (modelConfig.deploymentId && !/^[a-zA-Z0-9]+$/.test(modelConfig.deploymentId)) {
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

  async validateAllModels(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const allModels = this.getAllModels();
    
    // First validate static configuration
    for (const modelName of allModels) {
      const validation = this.validateModel(modelName);
      if (!validation.isValid && validation.error) {
        errors.push(validation.error);
      }
    }
    
    // Validate that provider/direct arrays are consistent with model configurations
    for (const providerModel of this.config.providerSupportedModels) {
      const modelConfig = this.config.models[providerModel]; // Use raw config to avoid deployment lookup
      if (!modelConfig) {
        errors.push(`Provider model '${providerModel}' listed in providerSupportedModels but not found in models configuration`);
      } else if (modelConfig.apiType !== 'provider') {
        errors.push(`Model '${providerModel}' is in providerSupportedModels but has apiType '${modelConfig.apiType}' instead of 'provider'`);
      }
    }
    
    for (const directModel of this.config.directApiModels) {
      const modelConfig = this.config.models[directModel]; // Use raw config to avoid deployment lookup
      if (!modelConfig) {
        errors.push(`Direct API model '${directModel}' listed in directApiModels but not found in models configuration`);
      } else if (modelConfig.apiType !== 'direct') {
        errors.push(`Model '${directModel}' is in directApiModels but has apiType '${modelConfig.apiType}' instead of 'direct'`);
      }
    }

    // Discover deployment IDs
    try {
      const discoveryResult = await deploymentDiscovery.validateAllModels(allModels);
      
      // Store discovered deployment IDs
      for (const modelName of discoveryResult.valid) {
        const deploymentId = await deploymentDiscovery.getDeploymentId(modelName);
        if (deploymentId) {
          this.deploymentIds.set(modelName, deploymentId);
        }
      }
      
      // Add discovery errors
      errors.push(...discoveryResult.errors);
      
      this.initialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to discover deployment IDs: ${errorMessage}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async reloadConfiguration(): Promise<void> {
    this.loadConfiguration();
    this.deploymentIds.clear();
    this.initialized = false;
    await this.validateAllModels();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getDeploymentId(modelName: string): string | undefined {
    const config = this.config.models[modelName];
    return config?.deploymentId || this.deploymentIds.get(modelName);
  }
}

export const modelRouter = new ModelRouter();
