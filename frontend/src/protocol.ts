// Shared JSONL protocol between the frontend and the C++ engine.
//
// This module is the single source of truth for the wire format. It mirrors
// engine/include/arcanum/engine.hpp (MessageType / RequestType enums) and is
// intentionally free of React/DOM dependencies so it can be unit tested.

/** Engine -> Frontend message types (engine.hpp MessageType). */
export const MessageType = {
  LOG: 0x01,
  PROGRESS: 0x02,
  RESULT: 0x03,
  ERROR: 0x04,
  EVENT: 0x05,
  STREAM_CHUNK: 0x06,
  TOOL_CALL: 0x07,
  TOOL_RESULT: 0x08,
} as const;

/** Frontend -> Engine message types. */
export const EngineMessageType = {
  ...MessageType,
  REQUEST: 0x80,
  CANCEL: 0x81,
  CONFIG_UPDATE: 0x82,
  PLUGIN_LOAD: 0x83,
  PLUGIN_UNLOAD: 0x84,
} as const;

/** Request payload types (engine.hpp RequestType). */
export const RequestType = {
  CHAT_COMPLETION: 0x01,
  TOOL_EXECUTE: 0x02,
  FILE_READ: 0x03,
  FILE_WRITE: 0x04,
  FILE_LIST: 0x05,
  SHELL_EXECUTE: 0x06,
  HTTP_REQUEST: 0x07,
  WS_CONNECT: 0x08,
  SSE_CONNECT: 0x09,
  PLUGIN_CALL: 0x0a,
  AGENT_RUN: 0x0b,
} as const;

/** Extra request types implemented by the engine (not in the C++ enum). */
export const EngineRequestType = {
  ...RequestType,
  PROVIDER_LIST: 0xf0,
  CONFIG_GET: 0xf1,
  PING: 0xf2,
} as const;

export interface WireMessage {
  type: number;
  id: number;
  correlation_id: number;
  payload: Record<string, unknown>;
  timestamp: string;
}

/** Human readable name for a numeric message type (used in logs/tests). */
export function messageTypeName(type: number): string {
  for (const [name, value] of Object.entries(EngineMessageType)) {
    if (value === type) return name;
  }
  return `UNKNOWN(0x${type.toString(16)})`;
}

/** Human readable name for a numeric request type. */
export function requestTypeName(type: number): string {
  for (const [name, value] of Object.entries(EngineRequestType)) {
    if (value === type) return name;
  }
  return `UNKNOWN(0x${type.toString(16)})`;
}

/** Serialize a message to a single JSONL line (no trailing newline). */
export function encodeMessage(msg: WireMessage): string {
  return JSON.stringify(msg);
}

/**
 * Parse one JSONL line. Returns null for blank lines and when the line is not
 * valid JSON so callers can decide whether to log or ignore.
 */
export function parseMessage(line: string): WireMessage | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Partial<WireMessage>;
  if (typeof obj.type !== 'number') return null;
  return {
    type: obj.type,
    id: typeof obj.id === 'number' ? obj.id : 0,
    correlation_id: typeof obj.correlation_id === 'number' ? obj.correlation_id : 0,
    payload:
      obj.payload && typeof obj.payload === 'object'
        ? (obj.payload as Record<string, unknown>)
        : {},
    timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : new Date().toISOString(),
  };
}

/**
 * Extract complete JSONL lines from a stream buffer.
 * Returns the parsed lines plus the remaining (incomplete) buffer, which the
 * caller must keep feeding new chunks into.
 */
export function extractLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts, rest };
}

/** Streaming chunk payload as emitted by the engine. */
export interface StreamChunkPayload {
  id?: string;
  model?: string;
  done?: boolean;
  choices?: Array<{ index?: number; delta?: { content?: string; role?: string }; finish_reason?: string | null }>;
}

/** Get the text delta of a stream chunk (empty string when there is none). */
export function chunkDelta(chunk: StreamChunkPayload | undefined): string {
  if (!chunk || !Array.isArray(chunk.choices)) return '';
  let text = '';
  for (const choice of chunk.choices) {
    if (choice && choice.delta && typeof choice.delta.content === 'string') {
      text += choice.delta.content;
    }
  }
  return text;
}

/** True when the engine signalled the end of a streamed response. */
export function isChunkDone(chunk: StreamChunkPayload | undefined): boolean {
  return Boolean(chunk && chunk.done === true);
}
