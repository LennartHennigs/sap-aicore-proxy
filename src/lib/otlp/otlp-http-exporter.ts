import type { Span, Trace, TracingExporter } from '@openai/agents';
import { toOtlpSpan } from './otlp-http-exporter.utils.js';

export type OTLPHttpExporterOptions = {
  endpoint: string;
  headers: Record<string, string>;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
};

export class OTLPHttpExporter implements TracingExporter {
  #options: OTLPHttpExporterOptions;

  constructor(options: Partial<OTLPHttpExporterOptions> = {}) {
    if (!options.endpoint) {
      throw new Error('OTLPHttpExporter requires an endpoint to be specified.');
    }

    this.#options = {
      endpoint: options.endpoint,
      headers: options.headers ?? {},
      maxRetries: options.maxRetries ?? 3,
      baseDelay: options.baseDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000
    };
  }

  async export(items: (Trace | Span<any>)[], signal?: AbortSignal): Promise<void> {
    const spans = items.map(toOtlpSpan).filter(Boolean);
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans
            }
          ]
        }
      ]
    };

    let attempts = 0;
    let delay = this.#options.baseDelay;

    while (attempts < this.#options.maxRetries) {
      try {
        const response = await fetch(this.#options.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.#options.headers
          },
          body: JSON.stringify(payload),
          signal
        });

        if (response.ok) {
          console.debug(`Exported ${spans.length} items`);
          return;
        }

        if (response.status >= 400 && response.status < 500) {
          console.error(`[non-fatal] OTLP client error ${response.status}: ${await response.text()}`);
          return;
        }

        console.warn(`[non-fatal] OTLP: server error ${response.status}, retrying.`);
      } catch (error: any) {
        console.error('[non-fatal] OTLP: request failed: ', error);
      }

      if (signal?.aborted) {
        console.error('OTLP: request aborted');
        return;
      }

      const sleepTime = delay + Math.random() * 0.1 * delay;
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
      delay = Math.min(delay * 2, this.#options.maxDelay);
      attempts++;
    }

    console.error(`OTLP: failed to export traces after ${this.#options.maxRetries} attempts`);
  }
}
