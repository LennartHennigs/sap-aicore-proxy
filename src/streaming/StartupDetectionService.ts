import { streamingDetectionService, type StreamingCapability } from './detection/StreamingDetectionService.js';
import { modelRouter } from '../models/model-router.js';
import { SecureLogger } from '../utils/secure-logger.js';
import { AnthropicDirectHandler } from './direct-apis/AnthropicDirectHandler.js';
import { GeminiDirectHandler } from './direct-apis/GeminiDirectHandler.js';

export interface ModelStreamingStatus {
  modelName: string;
  expected: boolean;
  detected: StreamingCapability;
  route: string;
  detectionTime: number;
  warnings: string[];
}

export class StartupDetectionService {
  private static instance: StartupDetectionService;
  private readonly debugLevel: string;

  private constructor() {
    this.debugLevel = process.env.STREAMING_DEBUG_LEVEL || 'none';
  }

  static getInstance(): StartupDetectionService {
    if (!StartupDetectionService.instance) {
      StartupDetectionService.instance = new StartupDetectionService();
    }
    return StartupDetectionService.instance;
  }

  /**
   * Run streaming detection for all models on startup
   */
  async runStartupDetection(): Promise<ModelStreamingStatus[]> {
    const modelNames = modelRouter.getAllModels();
    
    if (modelNames.length === 0) {
      return [];
    }

    // Run detections in parallel for faster startup (silent)
    const detectionPromises = modelNames.map(modelName => {
      const modelConfig = modelRouter.getModelConfig(modelName);
      return this.detectModelCapability(modelName, modelConfig);
    });

    const results = await Promise.all(detectionPromises);

    // Only display results if debug level is full
    if (this.debugLevel === 'full') {
      this.displayResults(results, 0);
    }

    return results;
  }

  /**
   * Detect streaming capability for a single model
   */
  private async detectModelCapability(modelName: string, modelConfig: any): Promise<ModelStreamingStatus> {
    const startTime = Date.now();
    const warnings: string[] = [];
    
    try {
      // Get expected streaming capability from models.json
      const expected = modelConfig.supportsStreaming || false;
      
      // Build direct API config if applicable
      const directApiConfig = this.getDirectApiConfig(modelName);
      const deploymentId = modelConfig.deploymentId || 'unknown';
      
      // Detect actual capabilities
      const detected = await streamingDetectionService.detectStreamingCapability(
        modelName,
        deploymentId,
        directApiConfig,
        modelConfig
      );

      const detectionTime = Date.now() - startTime;
      
      // Determine the route that will be used
      const route = this.determineRoute(detected, modelName);
      
      // Check for mismatches between expected and detected
      if (expected && !detected.sapAiCore && !detected.directApi) {
        warnings.push('Expected streaming but none detected');
      }
      if (!expected && (detected.sapAiCore || detected.directApi)) {
        warnings.push('Streaming detected but not expected in config');
      }

      return {
        modelName,
        expected,
        detected,
        route,
        detectionTime,
        warnings
      };

    } catch (error) {
      const detectionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        modelName,
        expected: modelConfig.supportsStreaming || false,
        detected: {
          sapAiCore: false,
          directApi: false,
          lastChecked: new Date(),
          autoDetected: true,
          error: errorMessage
        },
        route: 'fallback-mock',
        detectionTime,
        warnings: [`Detection failed: ${errorMessage}`]
      };
    }
  }

  /**
   * Display simplified detection results
   */
  private displayResults(results: ModelStreamingStatus[], totalTime: number): void {
    if (this.debugLevel === 'summary') {
      return; // Skip detailed results for summary mode
    }

    console.log('🌊 Models:');

    for (const result of results) {
      const { modelName, detected } = result;
      
      // Simplify model name
      const displayName = this.getSimpleModelName(modelName);
      
      // Determine streaming status
      const streamingStatus = detected.sapAiCore || detected.directApi ? 'true streaming' : 'mock streaming';
      const statusIcon = detected.sapAiCore || detected.directApi ? '✅' : '🔄';
      
      console.log(`   ${statusIcon} ${displayName}: ${streamingStatus}`);
    }
    
    console.log('');
  }

  /**
   * Display summary statistics
   */
  private displaySummary(results: ModelStreamingStatus[]): void {
    const totalModels = results.length;
    const trueStreamingCount = results.filter(r => 
      r.detected.sapAiCore || r.detected.directApi
    ).length;
    const mockStreamingCount = totalModels - trueStreamingCount;
    const errorCount = results.filter(r => r.detected.error).length;

    console.log(`✅ Streaming detection complete:`);
    console.log(`   • ${trueStreamingCount}/${totalModels} models have true streaming`);
    console.log(`   • ${mockStreamingCount}/${totalModels} models use mock streaming`);
    
    if (errorCount > 0) {
      console.log(`   • ${errorCount} detection errors`);
    }

    // Show direct API availability
    const anthropicAvailable = AnthropicDirectHandler.isAvailable();
    const geminiAvailable = GeminiDirectHandler.isAvailable();
    
    if (anthropicAvailable || geminiAvailable) {
      console.log(`   • Direct API keys: ${anthropicAvailable ? 'Anthropic ✅' : 'Anthropic ❌'} ${geminiAvailable ? 'Gemini ✅' : 'Gemini ❌'}`);
    }

    console.log('');
  }

  /**
   * Display recommendations for improving streaming
   */
  private displayRecommendations(results: ModelStreamingStatus[]): void {
    const recommendations: string[] = [];
    
    // Check for models that could benefit from direct API keys
    const claudeResult = results.find(r => r.modelName.includes('claude') || r.modelName.includes('anthropic'));
    const geminiResult = results.find(r => r.modelName.includes('gemini') || r.modelName.includes('google'));
    
    if (claudeResult && !claudeResult.detected.directApi && !AnthropicDirectHandler.isAvailable()) {
      recommendations.push('Add ANTHROPIC_API_KEY for true Claude streaming');
    }
    
    if (geminiResult && !geminiResult.detected.directApi && !GeminiDirectHandler.isAvailable()) {
      recommendations.push('Add GOOGLE_AI_API_KEY for true Gemini streaming');
    }

    // Check for configuration mismatches
    const mismatches = results.filter(r => r.warnings.length > 0);
    if (mismatches.length > 0) {
      recommendations.push('Review models.json configuration for streaming mismatches');
    }

    if (recommendations.length > 0) {
      console.log('💡 RECOMMENDATIONS:');
      for (const rec of recommendations) {
        console.log(`   • ${rec}`);
      }
      console.log('');
    }
  }

  /**
   * Get direct API configuration for a model
   */
  private getDirectApiConfig(modelName: string): any {
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      return {
        endpoint: 'https://api.anthropic.com/v1/messages',
        requiresApiKey: 'ANTHROPIC_API_KEY',
        streamingEndpoint: 'https://api.anthropic.com/v1/messages'
      };
    }

    if (modelName.includes('gemini') || modelName.includes('google')) {
      return {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        requiresApiKey: 'GOOGLE_AI_API_KEY',
        streamingEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent'
      };
    }

    return undefined;
  }

  /**
   * Determine which route will be used for a model
   */
  private determineRoute(detected: StreamingCapability, modelName: string): string {
    const preferDirectApi = process.env.PREFER_DIRECT_API_STREAMING === 'true';
    const directApiAvailable = this.isDirectApiAvailable(modelName);

    if (preferDirectApi && detected.directApi && directApiAvailable) {
      return 'direct-api-true';
    }
    
    if (detected.sapAiCore) {
      return 'sap-aicore-true';
    }
    
    if (detected.directApi && directApiAvailable) {
      return 'direct-api-true';
    }
    
    return 'sap-aicore-mock';
  }

  /**
   * Check if direct API is available for a model
   */
  private isDirectApiAvailable(modelName: string): boolean {
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      return AnthropicDirectHandler.isAvailable();
    }
    if (modelName.includes('gemini') || modelName.includes('google')) {
      return GeminiDirectHandler.isAvailable();
    }
    return false;
  }

  /**
   * Get direct API status string
   */
  private getDirectApiStatus(modelName: string, detected: boolean): string {
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      const available = AnthropicDirectHandler.isAvailable();
      if (available && detected) return '✅ TRUE STREAMING';
      if (available && !detected) return '⚠️  Available but no streaming detected';
      return '❌ ANTHROPIC_API_KEY not provided';
    }
    
    if (modelName.includes('gemini') || modelName.includes('google')) {
      const available = GeminiDirectHandler.isAvailable();
      if (available && detected) return '✅ TRUE STREAMING';
      if (available && !detected) return '⚠️  Available but no streaming detected';
      return '❌ GOOGLE_AI_API_KEY not provided';
    }
    
    return '❌ Not applicable';
  }

  /**
   * Get emoji for route type
   */
  private getRouteEmoji(route: string): string {
    switch (route) {
      case 'sap-aicore-true':
      case 'direct-api-true':
        return '🌊';
      case 'sap-aicore-mock':
        return '🔄';
      default:
        return '⚠️';
    }
  }

  /**
   * Format route name for display
   */
  private formatRoute(route: string): string {
    switch (route) {
      case 'sap-aicore-true':
        return 'SAP AI Core True Streaming';
      case 'direct-api-true':
        return 'Direct API True Streaming';
      case 'sap-aicore-mock':
        return 'SAP AI Core Mock Streaming';
      case 'fallback-mock':
        return 'Fallback Mock Streaming';
      default:
        return route;
    }
  }

  /**
   * Simplify model names for display
   */
  private getSimpleModelName(modelName: string): string {
    if (modelName.includes('gpt-5-nano')) {
      return 'GPT-5 Nano';
    }
    if (modelName.includes('claude') || modelName.includes('anthropic')) {
      return 'Claude';
    }
    if (modelName.includes('gemini')) {
      return 'Gemini';
    }
    
    // Fallback: capitalize first letter and replace dashes/underscores
    return modelName
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get capability summary for external use
   */
  getCapabilitySummary(): Record<string, any> {
    return streamingDetectionService.getCapabilitySummary();
  }
}

export const startupDetectionService = StartupDetectionService.getInstance();
