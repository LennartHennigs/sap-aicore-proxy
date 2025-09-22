import { sapAiCore } from '@ai-foundry/sap-aicore-provider';
import { aisdk } from '../lib/ai-sdk.js';
import { Agent, setTracingDisabled } from '@openai/agents';
import { modelRouter } from '../models/model-router.js';
import { config } from '../config/app-config.js';
import { SecureLogger } from '../utils/secure-logger.js';

export interface PooledModel {
  agent: Agent;
  lastUsed: number;
  requestCount: number;
}

class ModelPool {
  private pool: Map<string, PooledModel> = new Map();
  private readonly maxIdleTime = config.models.pooling.maxIdleTime;
  private readonly cleanupInterval = config.models.pooling.cleanupInterval;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Disable tracing globally
    setTracingDisabled(true);
    
    // Start cleanup timer
    this.startCleanup();
  }

  async getModel(modelName: string): Promise<Agent> {
    const existing = this.pool.get(modelName);
    
    if (existing) {
      // Update usage stats
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.agent;
    }

    // Create new model instance
    const modelConfig = modelRouter.getModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model ${modelName} not found in configuration`);
    }

    SecureLogger.logModelPoolOperation('Creating new model instance', modelName);
    
    const providerModelName = `${config.models.providers.sapAiCore.prefix}/${modelName}`;
    const model = aisdk(sapAiCore(providerModelName));
    
    const agent = new Agent({
      name: `SAP AI Assistant - ${modelName}`,
      instructions: 'You are a helpful AI assistant.',
      model: model
    });

    // Add to pool
    const pooledModel: PooledModel = {
      agent,
      lastUsed: Date.now(),
      requestCount: 1
    };
    
    this.pool.set(modelName, pooledModel);
    SecureLogger.logModelConfigured(modelName);
    
    return agent;
  }

  async getModelForStreaming(modelName: string): Promise<any> {
    const existing = this.pool.get(modelName);
    
    if (existing) {
      // Update usage stats
      existing.lastUsed = Date.now();
      existing.requestCount++;
      return existing.agent.model;
    }

    // Create new model instance if not exists
    await this.getModel(modelName);
    const pooledModel = this.pool.get(modelName);
    return pooledModel?.agent.model;
  }

  getPoolStats(): { [modelName: string]: { requestCount: number; lastUsed: string; idleTime: string } } {
    const stats: { [modelName: string]: { requestCount: number; lastUsed: string; idleTime: string } } = {};
    const now = Date.now();
    
    for (const [modelName, pooledModel] of this.pool.entries()) {
      const idleTime = now - pooledModel.lastUsed;
      stats[modelName] = {
        requestCount: pooledModel.requestCount,
        lastUsed: new Date(pooledModel.lastUsed).toISOString(),
        idleTime: `${Math.round(idleTime / 1000)}s`
      };
    }
    
    return stats;
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [modelName, pooledModel] of this.pool.entries()) {
      const idleTime = now - pooledModel.lastUsed;
      
      if (idleTime > this.maxIdleTime) {
        toRemove.push(modelName);
      }
    }
    
    if (toRemove.length > 0) {
      SecureLogger.logModelPoolOperation(`Cleaning up ${toRemove.length} idle model instances`);
      for (const modelName of toRemove) {
        this.pool.delete(modelName);
      }
    }
  }

  preloadModels(modelNames: string[]): void {
    SecureLogger.logModelPoolOperation(`Preloading ${modelNames.length} models`);
    
    // Preload models asynchronously without waiting
    modelNames.forEach(async (modelName) => {
      try {
        if (modelRouter.isProviderSupported(modelName)) {
          await this.getModel(modelName);
        }
      } catch (error) {
        SecureLogger.logError('Model preload', error, modelName);
      }
    });
  }

  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    SecureLogger.logModelPoolOperation(`Shutting down model pool with ${this.pool.size} instances`);
    this.pool.clear();
  }
}

export const modelPool = new ModelPool();
