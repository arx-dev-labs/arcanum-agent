// Unit tests for the JSONL wire protocol (frontend <-> engine).

import { describe, it, expect } from 'vitest';
import {
  EngineMessageType,
  EngineRequestType,
  MessageType,
  chunkDelta,
  encodeMessage,
  extractLines,
  isChunkDone,
  messageTypeName,
  parseMessage,
  requestTypeName,
} from './protocol';

describe('protocol constants', () => {
  it('mirror the engine MessageType enum', () => {
    expect(MessageType.LOG).toBe(0x01);
    expect(MessageType.PROGRESS).toBe(0x02);
    expect(MessageType.RESULT).toBe(0x03);
    expect(MessageType.ERROR).toBe(0x04);
    expect(MessageType.EVENT).toBe(0x05);
    expect(MessageType.STREAM_CHUNK).toBe(0x06);
    expect(MessageType.TOOL_CALL).toBe(0x07);
    expect(MessageType.TOOL_RESULT).toBe(0x08);
    expect(EngineMessageType.REQUEST).toBe(0x80);
    expect(EngineMessageType.CANCEL).toBe(0x81);
    expect(EngineMessageType.CONFIG_UPDATE).toBe(0x82);
  });

  it('mirror the engine RequestType enum', () => {
    expect(EngineRequestType.CHAT_COMPLETION).toBe(0x01);
    expect(EngineRequestType.TOOL_EXECUTE).toBe(0x02);
    expect(EngineRequestType.AGENT_RUN).toBe(0x0b);
  });
});

describe('parseMessage', () => {
  it('parses a complete engine message', () => {
    const line =
      '{"type":3,"id":7,"correlation_id":2,"payload":{"ok":true},"timestamp":"2024-01-01T00:00:00.000Z"}';
    const msg = parseMessage(line);
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MessageType.RESULT);
    expect(msg!.id).toBe(7);
    expect(msg!.correlation_id).toBe(2);
    expect(msg!.payload).toEqual({ ok: true });
  });

  it('returns null for blank/garbage lines instead of throwing', () => {
    expect(parseMessage('')).toBeNull();
    expect(parseMessage('   ')).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage('{"type":"nope"}')).toBeNull();
    expect(parseMessage('42')).toBeNull();
  });

  it('fills safe defaults for missing fields', () => {
    const msg = parseMessage('{"type":5}');
    expect(msg).toEqual({
      type: 5,
      id: 0,
      correlation_id: 0,
      payload: {},
      timestamp: expect.any(String),
    });
  });
});

describe('extractLines', () => {
  it('splits complete lines and keeps the trailing partial line', () => {
    const buffer = '{"type":1}\n{"type":2}\n{"type":3';
    const { lines, rest } = extractLines(buffer);
    expect(lines).toEqual(['{"type":1}', '{"type":2}']);
    expect(rest).toBe('{"type":3');
  });

  it('returns nothing when there is no newline yet', () => {
    const { lines, rest } = extractLines('{"partial');
    expect(lines).toEqual([]);
    expect(rest).toBe('{"partial');
  });

  it('handles CRLF and blank lines', () => {
    const { lines, rest } = extractLines('{"type":1}\r\n\r\n{"type":2}\r\n');
    expect(lines.length).toBe(3);
    expect(parseMessage(lines[0])!.type).toBe(1);
    expect(parseMessage(lines[2])!.type).toBe(2);
    expect(rest).toBe('');
  });
});

describe('stream chunks', () => {
  const chunk = {
    id: 'chatcmpl-1',
    choices: [
      { index: 0, delta: { role: 'assistant', content: 'Hel' }, finish_reason: null },
      { index: 1, delta: { content: 'lo' }, finish_reason: null },
    ],
    done: false,
  };

  it('concatenates every choice delta', () => {
    expect(chunkDelta(chunk)).toBe('Hello');
    expect(chunkDelta(undefined)).toBe('');
    expect(chunkDelta({})).toBe('');
  });

  it('detects stream completion only via done:true', () => {
    expect(isChunkDone({ done: true })).toBe(true);
    expect(isChunkDone({ done: false })).toBe(false);
    expect(isChunkDone(undefined)).toBe(false);
  });
});

describe('names', () => {
  it('maps numeric codes to readable names', () => {
    expect(messageTypeName(0x03)).toBe('RESULT');
    expect(messageTypeName(0x80)).toBe('REQUEST');
    expect(requestTypeName(0x01)).toBe('CHAT_COMPLETION');
    expect(messageTypeName(0xde)).toBe('UNKNOWN(0xde)');
  });
});

describe('encodeMessage roundtrip', () => {
  it('serializes a message that parseMessage can read back', () => {
    const wire = {
      type: EngineMessageType.REQUEST,
      id: 11,
      correlation_id: 0,
      payload: { request_type: EngineRequestType.CHAT_COMPLETION, stream: true },
      timestamp: '2024-01-01T00:00:00.000Z',
    };
    const parsed = parseMessage(encodeMessage(wire));
    expect(parsed!.type).toBe(EngineMessageType.REQUEST);
    expect(parsed!.payload.request_type).toBe(EngineRequestType.CHAT_COMPLETION);
  });
});
