import type { ModelStrategy } from './ModelStrategy.js';
import { AnthropicStrategy } from './AnthropicStrategy.js';
import { GeminiStrategy } from './GeminiStrategy.js';
import { OpenAIStrategy } from './OpenAIStrategy.js';

export class ModelStrategyFactory {
  private static strategies: Map<string, () => ModelStrategy> = new Map([
    ['anthropic_bedrock', () => new AnthropicStrategy()],
    ['google_ai_studio', () => new GeminiStrategy()],
    ['openai', () => new OpenAIStrategy()],
    ['default', () => new OpenAIStrategy()]
  ]);

  /**
   * Create a strategy instance based on the request format
   */
  static create(requestFormat?: string): ModelStrategy {
    const format = requestFormat || 'default';
    const strategyFactory = this.strategies.get(format);
    
    if (!strategyFactory) {
      console.log(`⚠️ Unknown request format '${format}', falling back to OpenAI strategy`);
      return new OpenAIStrategy();
    }
    
    const strategy = strategyFactory();
    console.log(`🤖 Created strategy: ${strategy.getName()} for format: ${format}`);
    return strategy;
  }

  /**
   * Register a new strategy for a specific request format
   */
  static register(requestFormat: string, strategyFactory: () => ModelStrategy): void {
    this.strategies.set(requestFormat, strategyFactory);
    console.log(`✅ Registered new strategy for format: ${requestFormat}`);
  }

  /**
   * Get all supported request formats
   */
  static getSupportedFormats(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if a request format is supported
   */
  static isSupported(requestFormat: string): boolean {
    return this.strategies.has(requestFormat);
  }
}
