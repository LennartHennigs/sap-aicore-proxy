import { BatchTraceProcessor } from '@openai/agents';
import { OTLPHttpExporter } from './lib/otlp/otlp-http-exporter.js';

const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;
if (!LANGFUSE_SECRET_KEY) {
  throw new Error('Please set the LANGFUSE_SECRET_KEY environment variable.');
}

const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
if (!LANGFUSE_PUBLIC_KEY) {
  throw new Error('Please set the LANGFUSE_PUBLIC_KEY environment variable.');
}
const LANGFUSE_ENDPOINT = process.env.LANGFUSE_ENDPOINT || 'https://api.langfuse.com';
if (!LANGFUSE_ENDPOINT) {
  throw new Error('Please set the LANGFUSE_ENDPOINT environment variable.');
}

const exporter = new OTLPHttpExporter({
  endpoint: `${LANGFUSE_ENDPOINT}/api/public/otel/v1/traces`,
  headers: {
    Authorization: `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64')}`
  }
});
export const processor = new BatchTraceProcessor(exporter);
