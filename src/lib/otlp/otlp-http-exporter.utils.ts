import type { Span, Trace } from '@openai/agents';
import type { SpanData, SpanError } from './otlp-http-exporter.models.js';

function buildSpanAttributes(data: SpanData, error: SpanError | null): Array<{ key: string; value: any }> {
  const entries: Array<{ key: string; value: any }> = [];

  const add = (key: string, val: any) => {
    if (val === undefined || val === null) return;
    entries.push({
      key,
      value:
        typeof val === 'string'
          ? { stringValue: val }
          : typeof val === 'number'
            ? { doubleValue: val }
            : typeof val === 'boolean'
              ? { boolValue: val }
              : { stringValue: JSON.stringify(val) }
    });
  };

  add('span.type', data.type);
  add('gen_ai.system', 'openai');

  switch (data.type) {
    case 'agent':
      add('name', data.name);
      add('output_type', data.output_type);
      add('tools', data.tools);
      add('handoffs', data.handoffs);
      break;

    case 'function':
      add('name', data.name);
      add('input', data.input);
      add('output', data.output);
      add('mcp_data', data.mcp_data);
      break;

    case 'generation':
      add('gen_ai.request.model', data.model);
      add('request_data', {
        messages: [...(data.input ?? []), ...(data.output ?? [])],
        model: data.model
      });
      if (data.usage) {
        add('gen_ai.usage.input_tokens', data.usage.input_tokens);
        add('gen_ai.usage.output_tokens', data.usage.output_tokens);
      }
      break;

    case 'response':
      add('response_id', data.response_id);
      if (data._input) add('raw_input', data._input);
      if (data._response) add('response', data._response);
      break;

    case 'guardrail':
      add('name', data.name);
      add('triggered', data.triggered);
      break;

    case 'handoff':
      add('from_agent', data.from_agent);
      add('to_agent', data.to_agent);
      break;

    case 'custom':
      add('name', data.name);
      add('data', data.data);
      break;

    case 'transcription':
      add('model', data.model);
      add('input', { ...data.input, data: '[omitted]' });
      if (data.output) add('output', data.output);
      break;

    case 'speech':
      add('model', data.model);
      add('input', data.input);
      add('output', { ...data.output, data: '[omitted]' });
      break;

    case 'speech_group':
      add('input', data.input);
      break;

    case 'mcp_tools':
      add('server', data.server);
      add('result', data.result);
      break;
  }

  if (error) {
    add('error', error.message);
    if (error.data) {
      add('error.data', error.data);
    }
  }

  return entries;
}

function getSpanName(data: SpanData): string {
  switch (data.type) {
    case 'agent':
      return `Agent run: ${data.name}`;
    case 'function':
      return `Function: ${data.name}`;
    case 'generation':
      return `Chat completion with ${data.model ?? 'unknown model'}`;
    case 'response':
      return `Responses API`;
    case 'guardrail':
      return `Guardrail ${data.name} ${data.triggered ? 'triggered' : 'not triggered'}`;
    case 'handoff':
      return `Handoff: ${data.from_agent} → ${data.to_agent}`;
    case 'custom':
      return `Custom span: ${data.name}`;
    case 'speech_group':
      return `Text → Speech group`;
    case 'speech':
      return `Text → Speech`;
    case 'transcription':
      return `Speech → Text with ${data.model ?? 'unknown model'}`;
    case 'mcp_tools':
      return `MCP: list tools from server ${data.server ?? ''}`;
    default:
      throw new Error(`Unknown span type: ${data}`);
  }
}

export function toOtlpSpan(item: Trace | Span<SpanData>): any | null {
  if (item.type === 'trace') {
    return null; // Skip trace spans, we only export spans
  }

  const traceId = item.traceId;
  const spanId = item.spanId;
  const parentId = item.parentId || undefined;
  const name = getSpanName(item.spanData);
  const startedAt = item.startedAt;
  const endedAt = item.endedAt;
  const error = item.error;
  const spanData = item.spanData;

  if (!traceId || !spanId || !name || !startedAt || !endedAt) {
    return null;
  }

  const startTimeUnixNano = Date.parse(startedAt) * 1_000_000;
  const endTimeUnixNano = Date.parse(endedAt) * 1_000_000;

  const attributes = buildSpanAttributes(spanData, error);

  const otlpSpan: any = {
    traceId: traceId,
    spanId: spanId,
    name: name,
    startTimeUnixNano: startTimeUnixNano.toString(),
    endTimeUnixNano: endTimeUnixNano.toString(),
    attributes,
    status: error
      ? {
          code: 2, // STATUS_CODE_ERROR
          message: error.message
        }
      : {
          code: 1 // STATUS_CODE_OK
        }
  };

  if (parentId) {
    otlpSpan.parentSpanId = parentId;
  }

  return otlpSpan;
}
