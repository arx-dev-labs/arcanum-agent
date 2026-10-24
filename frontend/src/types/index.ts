// Core types for Arcanum Agent

// The wire protocol is numeric (see protocol.ts / engine.hpp). The legacy
// string union was kept only for backwards compatibility of imports.
export type MessageType = number;

export type RequestType = number;

export interface BaseMessage {
  type: MessageType;
  id: number;
  correlation_id: number;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface RequestMessage {
  request_type: RequestType;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  required?: boolean;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Tool[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string;
  response_format?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  created: number;
  object: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

export interface StreamChunk {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }>;
  done: boolean;
}

export interface Provider {
  name: string;
  models: string[];
  config: Record<string, unknown>;
}

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author: string;
  capabilities: Record<string, unknown>;
}

export interface EngineConfig {
  data_dir: string;
  plugins_dir: string;
  log_level: string;
  enable_telemetry: boolean;
  provider_configs: Record<string, Record<string, unknown>>;
  plugin_configs: Record<string, Record<string, unknown>>;
}

// UI State types
export interface Conversation {
  id: string;
  title: string;
  messages: UIMessage[];
  model: string;
  provider: string;
  created_at: number;
  updated_at: number;
}

export interface UIMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  streaming?: boolean;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  tool_call_id?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface AgentState {
  status: 'idle' | 'thinking' | 'streaming' | 'tool_calling' | 'error';
  current_conversation: Conversation | null;
  conversations: Conversation[];
  providers: Provider[];
  plugins: Plugin[];
  config: EngineConfig | null;
  engine_connected: boolean;
  engine_status: 'starting' | 'running' | 'stopped' | 'error';
}

// Theme types
export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    text_muted: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  gradients: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

// Re-export the concrete theme names (defined in ../theme) for convenience.
export type { ThemeName } from '../theme';