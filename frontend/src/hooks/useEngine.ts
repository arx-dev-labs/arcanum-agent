// Engine communication hook - handles stdin/stdout JSONL protocol

import { useEffect, useRef, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BaseMessage, RequestMessage, RequestType, ChatCompletionRequest, ChatMessage, Tool } from '../types';
import { useStore } from '../store';

let messageId = 1;

export function useEngine() {
  const [connected, setConnected] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const pendingRequests = useRef<Map<number, (response: BaseMessage) => void>>(new Map());
  const stdinBuffer = useRef<string>('');
  const { setEngineConnected, setEngineStatus, addMessage, updateMessage, setAgentStatus } = useStore();

  // Send message to engine
  const send = useCallback((type: BaseMessage['type'], payload: Record<string, unknown>, correlationId?: number) => {
    const id = messageId++;
    const msg: BaseMessage = {
      type,
      id,
      correlation_id: correlationId || 0,
      payload,
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(msg) + '\n');
    return id;
  }, []);

  // Send request and wait for response
  const request = useCallback(async <T>(requestType: RequestType, payload: Record<string, unknown>, timeout = 30000): Promise<T> => {
    const id = send('request', { request_type: requestType, ...payload });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.current.delete(id);
        reject(new Error('Request timeout'));
      }, timeout);

      pendingRequests.current.set(id, (response) => {
        clearTimeout(timer);
        if (response.type === 'error') {
          reject(new Error(response.payload.error as string));
        } else {
          resolve(response.payload as T);
        }
      });
    });
  }, [send]);

  // Handle incoming messages
  useEffect(() => {
    const handleData = (chunk: Buffer) => {
      stdinBuffer.current += chunk.toString();
      const lines = stdinBuffer.current.split('\n');
      stdinBuffer.current = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg: BaseMessage = JSON.parse(line);
          handleMessage(msg);
        } catch (e) {
          console.error('Parse error:', e);
        }
      }
    };

    process.stdin.on('data', handleData);
    process.stdin.setEncoding('utf-8');

    return () => {
      process.stdin.off('data', handleData);
    };
  }, []);

  const handleMessage = useCallback((msg: BaseMessage) => {
    // Handle pending requests
    if (msg.correlation_id && pendingRequests.current.has(msg.correlation_id)) {
      const resolver = pendingRequests.current.get(msg.correlation_id)!;
      pendingRequests.current.delete(msg.correlation_id);
      resolver(msg);
      return;
    }

    // Handle async messages
    switch (msg.type) {
      case 'event':
        handleEvent(msg);
        break;
      case 'log':
        console.log('[Engine]', msg.payload.message);
        break;
      case 'stream_chunk':
        handleStreamChunk(msg);
        break;
      case 'tool_call':
        handleToolCall(msg);
        break;
      case 'tool_result':
        handleToolResult(msg);
        break;
      case 'progress':
        handleProgress(msg);
        break;
      case 'result':
        // Handled by pending requests
        break;
      case 'error':
        console.error('[Engine Error]', msg.payload);
        break;
    }
  }, []);

  const handleEvent = (msg: BaseMessage) => {
    const event = msg.payload.event as string;
    switch (event) {
      case 'engine.ready':
        setEngineReady(true);
        setEngineStatus('running');
        setConnected(true);
        setEngineConnected(true);
        break;
      case 'engine.shutdown':
        setEngineReady(false);
        setEngineStatus('stopped');
        setConnected(false);
        setEngineConnected(false);
        break;
    }
  };

  const handleStreamChunk = (msg: BaseMessage) => {
    const chunk = msg.payload.chunk as {
      id: string;
      choices: Array<{ index: number; delta: Partial<ChatMessage>; finish_reason: string | null }>;
      done: boolean;
    };

    const { current_conversation } = useStore.getState();
    if (!current_conversation) return;

    // Find or create streaming message
    const messages = current_conversation.messages;
    let streamingMsg = messages.find(m => m.streaming && m.role === 'assistant');

    if (!streamingMsg) {
      streamingMsg = {
        id: uuidv4(),
        role: 'assistant',
        content: '',
        streaming: true,
        timestamp: Date.now(),
      };
      addMessage(current_conversation.id, streamingMsg);
    }

    // Update content
    for (const choice of chunk.choices) {
      if (choice.delta.content) {
        updateMessage(current_conversation.id, streamingMsg.id, {
          content: streamingMsg.content + choice.delta.content,
        });
      }
    }

    if (chunk.done) {
      updateMessage(current_conversation.id, streamingMsg.id, { streaming: false });
      setAgentStatus('idle');
    } else {
      setAgentStatus('streaming');
    }
  };

  const handleToolCall = (msg: BaseMessage) => {
    const toolCall = msg.payload.tool_call as { id: string; name: string; arguments: string };
    setAgentStatus('tool_calling');
    // Tool call UI would be handled here
  };

  const handleToolResult = (msg: BaseMessage) => {
    const result = msg.payload.tool_result as { tool_call_id: string; result: unknown; error?: string };
    // Handle tool result
    setAgentStatus('streaming');
  };

  const handleProgress = (msg: BaseMessage) => {
    // Progress updates
  };

  // High-level API methods
  const chatCompletion = useCallback(async (request: ChatCompletionRequest) => {
    setAgentStatus('thinking');
    const id = send('request', {
      request_type: 'chat_completion',
      ...request,
    });
    return id;
  }, [send]);

  const executeTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    return request('tool_execute', { name, arguments: args });
  }, [request]);

  const readFile = useCallback(async (path: string) => {
    return request<string>('file_read', { path });
  }, [request]);

  const writeFile = useCallback(async (path: string, content: string) => {
    return request('file_write', { path, content });
  }, [request]);

  const listFiles = useCallback(async (path: string) => {
    return request<string[]>('file_list', { path });
  }, [request]);

  const shellExecute = useCallback(async (command: string, args: string[] = []) => {
    return request('shell_execute', { command, arguments: args });
  }, [request]);

  const httpRequest = useCallback(async (url: string, options: Record<string, unknown> = {}) => {
    return request('http_request', { url, ...options });
  }, [request]);

  return {
    connected,
    engineReady,
    send,
    request,
    chatCompletion,
    executeTool,
    readFile,
    writeFile,
    listFiles,
    shellExecute,
    httpRequest,
  };
}