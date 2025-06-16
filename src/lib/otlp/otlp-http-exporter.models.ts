export type SpanDataBase = {
  type: string;
};

export type AgentSpanData = SpanDataBase & {
  type: 'agent';
  name: string;
  handoffs?: string[];
  tools?: string[];
  output_type?: string;
};

export type FunctionSpanData = SpanDataBase & {
  type: 'function';
  name: string;
  input: string;
  output: string;
  mcp_data?: string;
};

export type GenerationSpanData = SpanDataBase & {
  type: 'generation';
  input?: Array<Record<string, any>>;
  output?: Array<Record<string, any>>;
  model?: string;
  model_config?: Record<string, any>;
  usage?: Record<string, any>;
};

export type ResponseSpanData = SpanDataBase & {
  type: 'response';
  response_id?: string;
  /**
   * Not used by the OpenAI tracing provider but helpful for other tracing providers.
   */
  _input?: string | Record<string, any>[];
  _response?: Record<string, any>;
};

export type HandoffSpanData = SpanDataBase & {
  type: 'handoff';
  from_agent?: string;
  to_agent?: string;
};

export type CustomSpanData = SpanDataBase & {
  type: 'custom';
  name: string;
  data: Record<string, any>;
};

export type GuardrailSpanData = SpanDataBase & {
  type: 'guardrail';
  name: string;
  triggered: boolean;
};

export type TranscriptionSpanData = SpanDataBase & {
  type: 'transcription';
  input: {
    data: string;
    format: 'pcm' | string;
  };
  output?: string;
  model?: string;
  model_config?: Record<string, any>;
};

export type SpeechSpanData = SpanDataBase & {
  type: 'speech';
  input?: string;
  output: {
    data: string;
    format: 'pcm' | string;
  };
  model?: string;
  model_config?: Record<string, any>;
};

export type SpeechGroupSpanData = SpanDataBase & {
  type: 'speech_group';
  input?: string;
};

export type MCPListToolsSpanData = SpanDataBase & {
  type: 'mcp_tools';
  server?: string;
  result?: string[];
};

export type SpanData =
  | AgentSpanData
  | FunctionSpanData
  | GenerationSpanData
  | ResponseSpanData
  | HandoffSpanData
  | CustomSpanData
  | GuardrailSpanData
  | TranscriptionSpanData
  | SpeechSpanData
  | SpeechGroupSpanData
  | MCPListToolsSpanData;

export type SpanError = {
  message: string;
  data?: Record<string, any>;
};
