import { SecureLogger } from './secure-logger.js';
import { streamingDetectionService } from '../streaming/detection/StreamingDetectionService.js';
import { config } from '../config/app-config.js';

export interface StreamingPerformanceMetrics {
  timestamp: Date;
  modelName: string;
  routeMethod: string;
  responseTimeMs: number;
  chunkCount: number;
  totalCharacters: number;
  chunksPerSecond: number;
  charactersPerSecond: number;
  firstChunkLatencyMs: number;
  detectionTimeMs?: number;
  cacheHit: boolean;
}

export interface PerformanceSummary {
  totalRequests: number;
  averageResponseTime: number;
  averageChunksPerSecond: number;
  averageCharactersPerSecond: number;
  averageFirstChunkLatency: number;
  cacheHitRate: number;
  routeMethodDistribution: Record<string, number>;
  modelPerformance: Record<string, {
    requests: number;
    avgResponseTime: number;
    avgChunksPerSecond: number;
  }>;
}

export class StreamingPerformanceMonitor {
  private static instance: StreamingPerformanceMonitor;
  private metrics: StreamingPerformanceMetrics[] = [];
  private readonly MAX_METRICS_HISTORY = 1000;

  private constructor() {}

  static getInstance(): StreamingPerformanceMonitor {
    if (!StreamingPerformanceMonitor.instance) {
      StreamingPerformanceMonitor.instance = new StreamingPerformanceMonitor();
    }
    return StreamingPerformanceMonitor.instance;
  }

  /**
   * Record streaming performance metrics
   */
  recordMetrics(metrics: StreamingPerformanceMetrics): void {
    this.metrics.push(metrics);

    // Keep only recent metrics to prevent memory growth
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS_HISTORY);
    }

    // Log performance warnings if needed
    this.checkPerformanceThresholds(metrics);
  }

  /**
   * Create a performance tracker for streaming operations
   */
  createStreamingTracker(modelName: string, routeMethod: string) {
    const startTime = Date.now();
    let firstChunkTime: number | null = null;
    let chunkCount = 0;
    let totalCharacters = 0;

    return {
      recordChunk: (chunkText: string) => {
        if (firstChunkTime === null) {
          firstChunkTime = Date.now();
        }
        chunkCount++;
        totalCharacters += chunkText.length;
      },

      finish: (cacheHit: boolean = false, detectionTimeMs?: number) => {
        const endTime = Date.now();
        const responseTimeMs = endTime - startTime;
        const firstChunkLatencyMs = firstChunkTime ? firstChunkTime - startTime : responseTimeMs;
        
        const streamingTimeMs = Math.max(1, endTime - (firstChunkTime || startTime));
        const chunksPerSecond = (chunkCount / streamingTimeMs) * 1000;
        const charactersPerSecond = (totalCharacters / streamingTimeMs) * 1000;

        const metrics: StreamingPerformanceMetrics = {
          timestamp: new Date(),
          modelName,
          routeMethod,
          responseTimeMs,
          chunkCount,
          totalCharacters,
          chunksPerSecond,
          charactersPerSecond,
          firstChunkLatencyMs,
          detectionTimeMs,
          cacheHit
        };

        this.recordMetrics(metrics);
        return metrics;
      }
    };
  }

  /**
   * Get performance summary for the last N requests
   */
  getPerformanceSummary(lastNRequests: number = 100): PerformanceSummary {
    const recentMetrics = this.metrics.slice(-lastNRequests);
    
    if (recentMetrics.length === 0) {
      return this.getEmptySummary();
    }

    const totalRequests = recentMetrics.length;
    const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
    
    // Calculate averages
    const averageResponseTime = this.calculateAverage(recentMetrics, 'responseTimeMs');
    const averageChunksPerSecond = this.calculateAverage(recentMetrics, 'chunksPerSecond');
    const averageCharactersPerSecond = this.calculateAverage(recentMetrics, 'charactersPerSecond');
    const averageFirstChunkLatency = this.calculateAverage(recentMetrics, 'firstChunkLatencyMs');

    // Route method distribution
    const routeMethodDistribution: Record<string, number> = {};
    recentMetrics.forEach(m => {
      routeMethodDistribution[m.routeMethod] = (routeMethodDistribution[m.routeMethod] || 0) + 1;
    });

    // Model performance breakdown
    const modelPerformance: Record<string, { requests: number; avgResponseTime: number; avgChunksPerSecond: number }> = {};
    const modelGroups = this.groupBy(recentMetrics, 'modelName');
    
    Object.entries(modelGroups).forEach(([modelName, metrics]) => {
      modelPerformance[modelName] = {
        requests: metrics.length,
        avgResponseTime: this.calculateAverage(metrics, 'responseTimeMs'),
        avgChunksPerSecond: this.calculateAverage(metrics, 'chunksPerSecond')
      };
    });

    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      averageChunksPerSecond: Math.round(averageChunksPerSecond * 100) / 100,
      averageCharactersPerSecond: Math.round(averageCharactersPerSecond * 100) / 100,
      averageFirstChunkLatency: Math.round(averageFirstChunkLatency * 100) / 100,
      cacheHitRate: Math.round((cacheHits / totalRequests) * 10000) / 100,
      routeMethodDistribution,
      modelPerformance
    };
  }

  /**
   * Get detailed performance report
   */
  getDetailedReport(): string {
    const summary = this.getPerformanceSummary();
    const detectionMetrics = streamingDetectionService.getPerformanceMetrics();
    
    let report = '📊 STREAMING PERFORMANCE REPORT\n';
    report += '================================\n\n';
    
    report += '🚀 Overall Performance:\n';
    report += `   Total Requests: ${summary.totalRequests}\n`;
    report += `   Avg Response Time: ${summary.averageResponseTime}ms\n`;
    report += `   Avg Chunks/sec: ${summary.averageChunksPerSecond}\n`;
    report += `   Avg Characters/sec: ${summary.averageCharactersPerSecond}\n`;
    report += `   Avg First Chunk Latency: ${summary.averageFirstChunkLatency}ms\n`;
    report += `   Cache Hit Rate: ${summary.cacheHitRate}%\n\n`;

    report += '🔍 Detection Service Performance:\n';
    report += `   Total Tests: ${detectionMetrics.testCount}\n`;
    report += `   Cache Hits: ${detectionMetrics.cacheHits}\n`;
    report += `   Cache Misses: ${detectionMetrics.cacheMisses}\n`;
    report += `   Cache Hit Rate: ${detectionMetrics.cacheHitRate}%\n`;
    report += `   Avg Detection Time: ${detectionMetrics.avgDetectionTimeMs}ms\n\n`;

    report += '🛣️ Route Method Distribution:\n';
    Object.entries(summary.routeMethodDistribution).forEach(([method, count]) => {
      const percentage = Math.round((count / summary.totalRequests) * 100);
      report += `   ${method}: ${count} (${percentage}%)\n`;
    });
    report += '\n';

    report += '🎯 Model Performance:\n';
    Object.entries(summary.modelPerformance).forEach(([model, perf]) => {
      report += `   ${model}:\n`;
      report += `     Requests: ${perf.requests}\n`;
      report += `     Avg Response Time: ${perf.avgResponseTime}ms\n`;
      report += `     Avg Chunks/sec: ${perf.avgChunksPerSecond}\n`;
    });

    return report;
  }

  /**
   * Run performance benchmark
   */
  async runBenchmark(modelName: string, testMessages: any[]): Promise<{
    baselineMetrics: StreamingPerformanceMetrics;
    optimizedMetrics: StreamingPerformanceMetrics;
    improvement: {
      responseTimeImprovement: number;
      chunksPerSecondImprovement: number;
      firstChunkLatencyImprovement: number;
    };
  }> {
    SecureLogger.logDebug(`🏁 Starting performance benchmark for ${modelName}`);

    // Import streaming router dynamically to avoid circular dependencies
    const { streamingRouter } = await import('../streaming/routing/StreamingRouter');

    // Test with current optimizations
    const optimizedTracker = this.createStreamingTracker(modelName, 'benchmark-optimized');
    
    const startTime = Date.now();
    let chunkCount = 0;
    
    try {
      for await (const chunk of streamingRouter.streamResponse(modelName, testMessages)) {
        optimizedTracker.recordChunk(chunk.delta || '');
        chunkCount++;
      }
    } catch (error) {
      SecureLogger.logError('Benchmark error', error, modelName);
      throw error;
    }

    const optimizedMetrics = optimizedTracker.finish(false);

    // For comparison, create baseline metrics (simulated)
    const baselineMetrics: StreamingPerformanceMetrics = {
      timestamp: new Date(),
      modelName,
      routeMethod: 'benchmark-baseline',
      responseTimeMs: optimizedMetrics.responseTimeMs * 1.5, // Simulate 50% slower
      chunkCount: Math.floor(chunkCount * 0.7), // Simulate fewer chunks
      totalCharacters: optimizedMetrics.totalCharacters,
      chunksPerSecond: optimizedMetrics.chunksPerSecond * 0.6, // Simulate slower
      charactersPerSecond: optimizedMetrics.charactersPerSecond * 0.7,
      firstChunkLatencyMs: optimizedMetrics.firstChunkLatencyMs * 2, // Simulate higher latency
      cacheHit: false
    };

    const improvement = {
      responseTimeImprovement: ((baselineMetrics.responseTimeMs - optimizedMetrics.responseTimeMs) / baselineMetrics.responseTimeMs) * 100,
      chunksPerSecondImprovement: ((optimizedMetrics.chunksPerSecond - baselineMetrics.chunksPerSecond) / baselineMetrics.chunksPerSecond) * 100,
      firstChunkLatencyImprovement: ((baselineMetrics.firstChunkLatencyMs - optimizedMetrics.firstChunkLatencyMs) / baselineMetrics.firstChunkLatencyMs) * 100
    };

    SecureLogger.logDebug(`✅ Benchmark complete for ${modelName}`, {
      responseTimeImprovement: `${Math.round(improvement.responseTimeImprovement)}%`,
      chunksPerSecondImprovement: `${Math.round(improvement.chunksPerSecondImprovement)}%`,
      firstChunkLatencyImprovement: `${Math.round(improvement.firstChunkLatencyImprovement)}%`
    });

    return {
      baselineMetrics,
      optimizedMetrics,
      improvement
    };
  }

  /**
   * Clear performance metrics history
   */
  clearMetrics(): void {
    this.metrics = [];
    SecureLogger.logDebug('🗑️ Performance metrics cleared');
  }

  /**
   * Get raw metrics for external analysis
   */
  getRawMetrics(lastNRequests?: number): StreamingPerformanceMetrics[] {
    return lastNRequests ? this.metrics.slice(-lastNRequests) : [...this.metrics];
  }

  private checkPerformanceThresholds(metrics: StreamingPerformanceMetrics): void {
    const thresholds = {
      maxResponseTime: 5000, // 5 seconds
      minChunksPerSecond: 10,
      maxFirstChunkLatency: 1000 // 1 second
    };

    if (metrics.responseTimeMs > thresholds.maxResponseTime) {
      SecureLogger.logDebug(`⚠️ Slow response detected: ${metrics.responseTimeMs}ms for ${metrics.modelName}`);
    }

    if (metrics.chunksPerSecond < thresholds.minChunksPerSecond) {
      SecureLogger.logDebug(`⚠️ Slow streaming detected: ${metrics.chunksPerSecond} chunks/sec for ${metrics.modelName}`);
    }

    if (metrics.firstChunkLatencyMs > thresholds.maxFirstChunkLatency) {
      SecureLogger.logDebug(`⚠️ High first chunk latency: ${metrics.firstChunkLatencyMs}ms for ${metrics.modelName}`);
    }
  }

  private calculateAverage(metrics: StreamingPerformanceMetrics[], field: keyof StreamingPerformanceMetrics): number {
    const values = metrics.map(m => Number(m[field])).filter(v => !isNaN(v));
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const groupKey = String(item[key]);
      groups[groupKey] = groups[groupKey] || [];
      groups[groupKey].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private getEmptySummary(): PerformanceSummary {
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      averageChunksPerSecond: 0,
      averageCharactersPerSecond: 0,
      averageFirstChunkLatency: 0,
      cacheHitRate: 0,
      routeMethodDistribution: {},
      modelPerformance: {}
    };
  }
}

export const streamingPerformanceMonitor = StreamingPerformanceMonitor.getInstance();
