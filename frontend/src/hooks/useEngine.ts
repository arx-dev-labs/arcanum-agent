// Engine communication hook - JSONL protocol over the engine's stdin/stdout.
//
// Responsibilities:
//   * own (or adopt) the engine child process and surface lifecycle errors
//   * correlate every request with its response via `correlation_id`
//   * resolve chat completions only when the engine really finishes them
//   * keep the streaming message lifecycle consistent (no duplicates/gaps)

import { useEffect, useRef, useCallback, useState } from 'react';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  BaseMessage,
  ChatCompletionRequest,
  ChatMessage,
  UIMessage,
} from '../types';
import { useStore } from '../store';
import {
  EngineMessageType,
  EngineRequestType,
  MessageType,
  chunkDelta,
  extractLines,
  isChunkDone,
  parseMessage,
  type StreamChunkPayload,
} from '../protocol';

type Payload = Record<string, unknown>;

type PendingKind = 'request' | 'stream';

interface PendingEntry {
  kind: PendingKind;
  resolve: (payload: Payload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  /** Conversation the stream belongs to (captured when the request started). */
  conversationId?: string;
  /** Message id of the in-flight assistant message. */
  messageId?: string;
}

export type EngineTransportStatus = 'spawning' | 'ready' | 'fallback' | 'error';

interface EngineTransportState {
  status: EngineTransportStatus;
  engineReady: boolean;
  error: string | null;
  onMessage: ((msg: BaseMessage) => void) | null;
}

/**
 * Process-level singleton: the hook may mount/unmount several times (React
 * remounts, hot reload), but the engine must be started exactly once.
 */
class EngineTransport {
  private state: EngineTransportState = {
    status: 'spawning',
    engineReady: false,
    error: null,
    onMessage: null,
  };

  private proc: ReturnType<typeof spawn> | null = null;
  private buffer = '';
  private nextId = 1;

  getState(): EngineTransportState {
    return this.state;
  }

  subscribe(listener: (state: EngineTransportState) => void): () => void {
    this.listeners.add(listener);
    this.ensureStarted();
    return () => {
      this.listeners.delete(listener);
    };
  }


  private listeners = new Set<(state: EngineTransportState) => void>();

  private patch(next: Partial<EngineTransportState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  /** Register the message handler (the transport owns exactly one). */
  patchOnMessage(handler: ((msg: BaseMessage) => void) | null): void {
    this.state = { ...this.state, onMessage: handler ?? undefined };
  }

  patchEngineReady(ready: boolean): void {
    this.patch({ engineReady: ready });
  }

  /** Resolve the engine binary path, or null when it cannot be found. */
  private resolveEngineBinary(): string | null {
    const fromEnv = process.env.ARX_ENGINE_BIN || process.env.ARCANUM_ENGINE_BIN;
    if (fromEnv && existsSync(fromEnv)) return fromEnv;

    const exe = process.platform === 'win32' ? 'arx-engine.exe' : 'arx-engine';
    const candidates = [
      path.resolve(process.cwd(), '..', 'engine', 'build', exe),
      path.resolve(process.cwd(), 'engine', 'build', exe),
      path.resolve(process.cwd(), '..', '..', 'engine', 'build', exe),
      path.resolve(process.cwd(), 'dist', exe),
      exe,
    ];
    for (const candidate of candidates) {
      if (candidate === exe || existsSync(candidate)) return candidate;
    }
    return null;
  }

  private ensureStarted() {
    if (this.proc || this.state.status === 'fallback' || this.state.status === 'error') return;

    const bin = this.resolveEngineBinary();
    if (!bin) {
      // Engine is expected to be started externally and piped to this process.
      this.adoptInheritedStdio();
      return;
    }

    try {
      const proc = spawn(bin, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.proc = proc;
      this.patch({ status: 'ready', error: null });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        this.proc = null;
        if (err.code === 'ENOENT') {
          this.adoptInheritedStdio();
        } else {
          this.fail(`Failed to start engine (${bin}): ${err.message}`);
        }
      });

      proc.on('exit', (code, signal) => {
        this.proc = null;
        this.fail(
          `Engine process exited unexpectedly (code: ${code ?? 'null'}, signal: ${signal ?? 'none'})`
        );
      });

      proc.stdout?.on('data', (chunk: Buffer) => this.feed(chunk.toString()));
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) this.lastStderr = text;
      });
    } catch (err) {
      this.proc = null;
      this.fail(`Failed to start engine (${bin}): ${(err as Error).message}`);
    }
  }

  private lastStderr = '';

  /** Use the inherited process stdio (engine started by an external wrapper). */
  private adoptInheritedStdio() {
    if (this.state.status === 'fallback') return;
    this.patch({
      status: 'fallback',
      error:
        'Engine binary not found locally - assuming it is started externally ' +
        '(pipe the engine into this process, or set ARX_ENGINE_BIN).',
    });
  }

  private fail(message: string) {
    this.patch({ status: 'error', engineReady: false, error: message });
  }

  private feed(text: string) {
    this.buffer += text;
    const { lines, rest } = extractLines(this.buffer);
    this.buffer = rest;
    for (const line of lines) {
      const msg = parseMessage(line);
      if (msg) this.state.onMessage?.(msg as BaseMessage);
    }
  }

  /** Write one message; returns the assigned message id. */
  send(msg: Omit<BaseMessage, 'id' | 'timestamp'>): number {
    const id = this.nextId++;
    const full: BaseMessage = {
      ...msg,
      id,
      timestamp: new Date().toISOString(),
    };
    const line = JSON.stringify(full) + '\n';

    if (this.proc?.stdin?.writable) {
      this.proc.stdin.write(line);
    } else if (this.state.status === 'fallback' || this.state.status === 'spawning') {
      process.stdout.write(line);
    } else {
      throw new Error('Engine transport is not writable');
    }
    return id;
  }

  /** Send a fire-and-forget CANCEL for a request id. */
  cancel(id: number): void {
    if (this.proc?.stdin?.writable) {
      this.proc.stdin.write(
        JSON.stringify({
          type: EngineMessageType.CANCEL,
          id: this.nextId++,
          correlation_id: id,
          payload: {},
          timestamp: new Date().toISOString(),
        }) + '\n'
      );
    }
  }

  shutdown(): void {
    this.proc?.kill();
    this.proc = null;
  }
}

const transport = new EngineTransport();

export function useEngine() {
  const [transportState, setTransportState] = useState(transport.getState());
  const [engineError, setEngineError] = useState<string | null>(null);
  const pending = useRef<Map<number, PendingEntry>>(new Map());
  const {
    setEngineConnected,
    setEngineStatus,
    addMessage,
    updateMessage,
    setAgentStatus,
  } = useStore.getState();

  // Subscribe to the transport once; keep the handler in a ref so it always
  // sees fresh store actions without re-subscribing.
  const handleMessageRef = useRef<(msg: BaseMessage) => void>(() => {});
  handleMessageRef.current = (msg: BaseMessage) => handleMessage(msg);

  useEffect(() => {
    const unsubscribe = transport.subscribe((state) => setTransportState(state));
    transport.getState(); // no-op, keeps typing honest
    return unsubscribe;
  }, []);

  useEffect(() => {
    transport.patchOnMessage((msg) => handleMessageRef.current(msg));
    return () => transport.patchOnMessage(null);
  }, []);

  // Mirror transport state into the store for the whole UI.
  useEffect(() => {
    setEngineConnected(transportState.status !== 'error');
    setEngineStatus(
      transportState.engineReady
        ? 'running'
        : transportState.status === 'error'
          ? 'error'
          : transportState.status === 'fallback'
            ? 'starting'
            : 'starting'
    );
    setEngineError(transportState.error ?? null);
  }, [transportState, setEngineConnected, setEngineStatus]);

  const connected = transportState.status === 'ready' || transportState.status === 'fallback';
  const engineReady = transportState.engineReady;

  const settle = useCallback((id: number, entry: PendingEntry | undefined) => {
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current.delete(id);
  }, []);

  /** Reject everything still in flight (engine died / transport closed). */
  const flushPending = useCallback((reason: string) => {
    for (const [id, entry] of pending.current) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      pending.current.delete(id);
    }
  }, []);

  const handleMessage = useCallback(
    (msg: BaseMessage) => {
      // Responses to in-flight requests are matched by correlation_id.
      if (msg.correlation_id && pending.current.has(msg.correlation_id)) {
        const entry = pending.current.get(msg.correlation_id)!;
        if (msg.type === MessageType.ERROR) {
          const message =
            (msg.payload.error as string) ||
            (msg.payload.message as string) ||
            'Engine returned an error';
          settle(msg.correlation_id, entry);
          entry.reject(new Error(message));
          setAgentStatus('error');
          return;
        }
        if (msg.type === MessageType.RESULT) {
          settle(msg.correlation_id, entry);
          entry.resolve(msg.payload);
          setAgentStatus('idle');
          return;
        }
        if (msg.type === MessageType.STREAM_CHUNK) {
          handleStreamChunk(msg, entry);
          return;
        }
        // Any other correlated message (progress/tool/event) falls through to
        // the generic handlers below.
      }

      switch (msg.type) {
        case MessageType.EVENT:
          handleEvent(msg);
          break;
        case MessageType.LOG:
          break;
        case MessageType.STREAM_CHUNK:
          handleStreamChunk(msg, undefined);
          break;
        case MessageType.TOOL_CALL:
          handleToolCall(msg);
          break;
        case MessageType.TOOL_RESULT:
          handleToolResult(msg);
          break;
        case MessageType.PROGRESS:
          handleProgress(msg);
          break;
        case MessageType.ERROR:
          setEngineError((msg.payload.error as string) || 'Engine error');
          setAgentStatus('error');
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setAgentStatus, setEngineError, settle]
  );

  const handleEvent = useCallback((msg: BaseMessage) => {
    const event = msg.payload.event as string;
    if (event === 'engine.ready') {
      transport.patchEngineReady(true);
      setAgentStatus('idle');
    } else if (event === 'engine.shutdown') {
      transport.patchEngineReady(false);
      setAgentStatus('idle');
    }
  }, [setAgentStatus]);

  const handleStreamChunk = useCallback(
    (msg: BaseMessage, entry: PendingEntry | undefined) => {
      const chunk = msg.payload.chunk as StreamChunkPayload | undefined;
      const conversationId =
        entry?.conversationId ?? useStore.getState().current_conversation?.id ?? null;

      if (!conversationId) {
        // Nothing to render into (no conversation open); still finish the
        // stream so the caller promise settles.
        if (isChunkDone(chunk) && entry) {
          settle(msg.correlation_id, entry);
          entry.resolve(msg.payload);
        }
        return;
      }

      // Resolve (or create) the in-flight assistant message for this stream.
      let messageId = entry?.messageId ?? null;
      if (!messageId) {
        const conversation = useStore
          .getState()
          .conversations.find((c) => c.id === conversationId);
        const existing = conversation?.messages.find(
          (m) => m.streaming && m.role === 'assistant'
        );
        if (existing) {
          messageId = existing.id;
        } else {
          messageId = uuidv4();
          const streamingMsg: UIMessage = {
            id: messageId,
            role: 'assistant',
            content: '',
            streaming: true,
            timestamp: Date.now(),
          };
          addMessage(conversationId, streamingMsg);
        }
        if (entry) entry.messageId = messageId;
      }

      const delta = chunkDelta(chunk);
      if (delta) {
        const conversation = useStore
          .getState()
          .conversations.find((c) => c.id === conversationId);
        const current = conversation?.messages.find((m) => m.id === messageId);
        updateMessage(conversationId, messageId, {
          content: (current?.content ?? '') + delta,
        });
      }

      if (isChunkDone(chunk)) {
        updateMessage(conversationId, messageId, { streaming: false });
        setAgentStatus('idle');
        if (entry) {
          settle(msg.correlation_id, entry);
          entry.resolve(msg.payload);
        }
      } else {
        setAgentStatus('streaming');
      }
    },
    [addMessage, settle, setAgentStatus, updateMessage]
  );

  const handleToolCall = useCallback(
    (msg: BaseMessage) => {
      const toolCall = msg.payload.tool_call as {
        id?: string;
        name?: string;
        arguments?: unknown;
      } | undefined;
      setAgentStatus('tool_calling');
      const conversationId = useStore.getState().current_conversation?.id;
      if (!toolCall || !conversationId) return;

      const toolMsg: UIMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: `Calling tool: ${toolCall.name ?? 'unknown'}`,
        streaming: false,
        timestamp: Date.now(),
        tool_calls: [
          {
            id: toolCall.id ?? uuidv4(),
            type: 'function',
            function: {
              name: toolCall.name ?? 'unknown',
              arguments:
                typeof toolCall.arguments === 'string'
                  ? toolCall.arguments
                  : JSON.stringify(toolCall.arguments ?? {}),
            },
          },
        ],
      };
      addMessage(conversationId, toolMsg);
    },
    [addMessage, setAgentStatus]
  );

  const handleToolResult = useCallback(
    (msg: BaseMessage) => {
      const result = msg.payload.tool_result as
        | { tool_call_id?: string; name?: string; result?: unknown; error?: string }
        | undefined;
      setAgentStatus('streaming');
      const conversationId = useStore.getState().current_conversation?.id;
      if (!result || !conversationId) return;

      const resultMsg: UIMessage = {
        id: uuidv4(),
        role: 'tool',
        content: result.error
          ? `Tool error: ${result.error}`
          : typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result ?? {}),
        streaming: false,
        timestamp: Date.now(),
        tool_results: [
          {
            tool_call_id: result.tool_call_id ?? '',
            name: result.name ?? '',
            result: result.result,
            ...(result.error ? { error: result.error } : {}),
          },
        ],
      };
      addMessage(conversationId, resultMsg);
    },
    [addMessage, setAgentStatus]
  );

  const handleProgress = useCallback(
    (msg: BaseMessage) => {
      const status = msg.payload.status as string | undefined;
      if (status === 'thinking' || status === 'streaming' || status === 'idle') {
        setAgentStatus(status);
      }
    },
    [setAgentStatus]
  );

  const send = useCallback(
    (type: number, payload: Payload, correlationId = 0) =>
      transport.send({
        type,
        correlation_id: correlationId,
        payload,
      } as Omit<BaseMessage, 'id' | 'timestamp'>),
    []
  );

  /** Generic request/response: resolves on RESULT, rejects on ERROR/timeout. */
  const request = useCallback(
    async <T>(
      requestType: number,
      payload: Payload,
      timeout = 30000
    ): Promise<T> => {
      if (!connected) {
        throw new Error(engineError ?? 'Engine is not connected');
      }

      const id = transport.send({
        type: EngineMessageType.REQUEST,
        correlation_id: 0,
        payload: { request_type: requestType, ...payload },
      } as Omit<BaseMessage, 'id' | 'timestamp'>);

      return new Promise<T>((resolve, reject) => {
        const entry: PendingEntry = {
          kind: 'request',
          resolve: (p) => resolve(p as T),
          reject,
          timer: setTimeout(() => {
            pending.current.delete(id);
            transport.cancel(id);
            reject(new Error(`Request timed out after ${timeout}ms`));
          }, timeout),
        };
        pending.current.set(id, entry);
      });
    },
    [connected, engineError]
  );

  /**
   * Chat completion. Resolves only when the engine finishes the response:
   * for streams, when the final `done` chunk arrives (or a RESULT message);
   * rejects on ERROR, engine death or timeout.
   */
  const chatCompletion = useCallback(
    async (
      req: ChatCompletionRequest,
      conversationId?: string,
      timeout = 120000
    ): Promise<Payload> => {
      if (!connected) {
        throw new Error(engineError ?? 'Engine is not connected');
      }
      setAgentStatus('thinking');

      const id = transport.send({
        type: EngineMessageType.REQUEST,
        correlation_id: 0,
        payload: {
          request_type: EngineRequestType.CHAT_COMPLETION,
          model: req.model,
          messages: req.messages as unknown as Payload,
          ...(req.tools ? { tools: req.tools as unknown as Payload } : {}),
          temperature: req.temperature ?? 0.7,
          max_tokens: req.max_tokens ?? 4096,
          ...(req.top_p !== undefined ? { top_p: req.top_p } : {}),
          stream: req.stream ?? false,
          ...(req.stop ? { stop: req.stop } : {}),
          ...(req.extra ? { extra: req.extra } : {}),
        },
      } as Omit<BaseMessage, 'id' | 'timestamp'>);

      return new Promise<Payload>((resolve, reject) => {
        const entry: PendingEntry = {
          kind: 'stream',
          resolve,
          reject,
          conversationId,
          timer: setTimeout(() => {
            pending.current.delete(id);
            transport.cancel(id);
            setAgentStatus('idle');
            reject(new Error(`Chat completion timed out after ${timeout}ms`));
          }, timeout),
        };
        pending.current.set(id, entry);
      });
    },
    [connected, engineError, setAgentStatus]
  );

  const executeTool = useCallback(
    (name: string, args: Payload) =>
      request<Payload>(EngineRequestType.TOOL_EXECUTE, { name, arguments: args }),
    [request]
  );

  const readFile = useCallback(
    (filePath: string) => request<string>(EngineRequestType.FILE_READ, { path: filePath }),
    [request]
  );

  const writeFile = useCallback(
    (filePath: string, content: string) =>
      request<Payload>(EngineRequestType.FILE_WRITE, { path: filePath, content }),
    [request]
  );

  const listFiles = useCallback(
    (dirPath: string) => request<string[]>(EngineRequestType.FILE_LIST, { path: dirPath }),
    [request]
  );

  const shellExecute = useCallback(
    (command: string, args: string[] = []) =>
      request<Payload>(EngineRequestType.SHELL_EXECUTE, { command, arguments: args }),
    [request]
  );

  const httpRequest = useCallback(
    (url: string, options: Payload = {}) =>
      request<Payload>(EngineRequestType.HTTP_REQUEST, { url, ...options }),
    [request]
  );

  const listProviders = useCallback(
    () => request<{ providers?: Payload[] }>(EngineRequestType.PROVIDER_LIST, {}),
    [request]
  );

  // Drop in-flight work when the transport dies.
  useEffect(() => {
    if (transportState.status === 'error') flushPending(engineError ?? 'Engine transport error');
  }, [transportState.status, engineError, flushPending]);

  return {
    connected,
    engineReady,
    engineError,
    transportStatus: transportState.status,
    send,
    request,
    chatCompletion,
    executeTool,
    readFile,
    writeFile,
    listFiles,
    shellExecute,
    httpRequest,
    listProviders,
  };
}

export type { ChatMessage };
