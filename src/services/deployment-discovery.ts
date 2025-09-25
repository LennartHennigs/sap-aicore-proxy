import { config } from '../config/app-config';

export interface DeploymentInfo {
  id: string;
  modelName: string;
  status: string;
  deploymentUrl?: string;
  configurationName?: string;
}

export interface DiscoveryResult {
  success: boolean;
  deployments: DeploymentInfo[];
  error?: string;
}

class DeploymentDiscoveryService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private deploymentCache: Map<string, string> = new Map(); // modelName -> deploymentId
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(`${config.aicore.clientId}:${config.aicore.clientSecret}`).toString('base64');
      
      const response = await fetch(`${config.aicore.authUrl}/oauth/token?grant_type=client_credentials`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      
      // Set expiry with buffer
      const expiresIn = (data.expires_in || 3600) - 60; // 60 second buffer
      this.tokenExpiry = now + (expiresIn * 1000);
      
      return this.accessToken;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to obtain access token: ${errorMessage}`);
    }
  }

  async discoverDeployments(): Promise<DiscoveryResult> {
    try {
      const accessToken = await this.getAccessToken();
      
      const response = await fetch(`${config.aicore.baseUrl}/v2/lm/deployments?scenarioId=foundation-models`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'AI-Resource-Group': 'default',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch deployments: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const deployments: DeploymentInfo[] = [];

      if (data.resources && Array.isArray(data.resources)) {
        for (const deployment of data.resources) {
          const modelName = this.extractModelName(deployment);
          if (modelName) {
            deployments.push({
              id: deployment.id,
              modelName,
              status: deployment.status,
              deploymentUrl: deployment.deploymentUrl,
              configurationName: deployment.configurationName
            });
          }
        }
      }

      // Update cache
      this.updateCache(deployments);

      return {
        success: true,
        deployments
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        deployments: [],
        error: errorMessage
      };
    }
  }

  private extractModelName(deployment: any): string | null {
    // Try different possible paths for model name
    const possiblePaths = [
      'details.resources.backendDetails.model.name',
      'details.resources.backend_details.model.name',
      'details.resources.model.name',
      'modelName'
    ];

    for (const path of possiblePaths) {
      const value = this.getNestedProperty(deployment, path);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  private updateCache(deployments: DeploymentInfo[]): void {
    this.deploymentCache.clear();
    
    for (const deployment of deployments) {
      if (deployment.status === 'RUNNING') {
        this.deploymentCache.set(deployment.modelName, deployment.id);
      }
    }
    
    this.cacheExpiry = Date.now() + this.CACHE_DURATION;
  }

  async getDeploymentId(modelName: string): Promise<string | null> {
    const now = Date.now();
    
    // Check environment variable override first
    const envVarName = this.getEnvVarName(modelName);
    const envOverride = process.env[envVarName];
    if (envOverride) {
      console.log(`🔧 Using environment override for ${modelName}: ${envOverride}`);
      return envOverride;
    }

    // Check cache
    if (now < this.cacheExpiry && this.deploymentCache.has(modelName)) {
      return this.deploymentCache.get(modelName) || null;
    }

    // Refresh cache
    const result = await this.discoverDeployments();
    if (!result.success) {
      console.warn(`⚠️  Failed to discover deployments: ${result.error}`);
      return null;
    }

    return this.deploymentCache.get(modelName) || null;
  }

  private getEnvVarName(modelName: string): string {
    // Convert model name to environment variable format
    // e.g., "gpt-5-nano" -> "GPT_5_NANO_DEPLOYMENT_ID"
    // e.g., "anthropic--claude-4-sonnet" -> "ANTHROPIC_CLAUDE_4_SONNET_DEPLOYMENT_ID"
    return modelName
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') + '_DEPLOYMENT_ID';
  }

  async validateAllModels(modelNames: string[]): Promise<{ valid: string[]; invalid: string[]; errors: string[] }> {
    const valid: string[] = [];
    const invalid: string[] = [];
    const errors: string[] = [];

    // Silent deployment discovery for clean startup

    for (const modelName of modelNames) {
      try {
        const deploymentId = await this.getDeploymentId(modelName);
        if (deploymentId) {
          valid.push(modelName);
          // Silent success
        } else {
          invalid.push(modelName);
          const envVar = this.getEnvVarName(modelName);
          errors.push(`Model '${modelName}' has no active deployment. Set ${envVar} to override.`);
        }
      } catch (error) {
        invalid.push(modelName);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Failed to discover deployment for '${modelName}': ${errorMessage}`);
      }
    }

    return { valid, invalid, errors };
  }

  clearCache(): void {
    this.deploymentCache.clear();
    this.cacheExpiry = 0;
  }
}

export const deploymentDiscovery = new DeploymentDiscoveryService();
