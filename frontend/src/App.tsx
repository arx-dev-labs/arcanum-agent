// Main App Component

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Text,
  useInput,
  useStdout,
  render,
} from 'ink';
import { GradientText, Spinner, Pulse, Fade } from './components/animated/AnimatedBox';
import { Sidebar } from './components/layout/Sidebar';
import { Message, WelcomeBanner, StatusBar, CommandPalette } from './components/chat/Message';
import { Input } from './components/chat/Input';
import { useStore } from './store';
import { useEngine } from './hooks/useEngine';
import { themes, type ThemeName } from './theme';
import type { ChatMessage, Conversation, UIMessage } from './types';
import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

const VERSION = '1.0.0';

export function App() {
  const stdout = useStdout();
  const { theme, themeName, setTheme } = useStore();
  const {
    current_conversation,
    conversations,
    providers,
    engine_connected,
    engine_status,
    status: agentStatus,
    addConversation,
    setCurrentConversation,
    removeConversation,
    addMessage,
    updateMessage,
    updateConversation,
    clearMessages,
    setProviders,
    setEngineConnected,
    setEngineStatus,
    setAgentStatus,
  } = useStore();

  const { connected, engineReady, engineError, chatCompletion, listProviders } = useEngine();
  const [activeTab, setActiveTab] = useState<'conversations' | 'providers' | 'plugins' | 'settings'>('conversations');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(35);

  // Initialize engine connection
  useEffect(() => {
    setEngineConnected(connected);
    setEngineStatus(engineReady ? 'running' : 'starting');
  }, [connected, engineReady, setEngineConnected, setEngineStatus]);

  // Load providers on connect
  useEffect(() => {
    if (!engineReady) return;
    let cancelled = false;

    listProviders()
      .then((result) => {
        if (cancelled) return;
        if (result.providers) {
          setProviders(result.providers as any);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback to defaults
        setProviders([
          { name: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], config: {} },
          { name: 'anthropic', models: ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus'], config: {} },
          { name: 'nvidia', models: ['nemotron-3-ultra', 'llama-3.1-405b', 'mistral-large'], config: {} },
          { name: 'custom', models: [], config: {} },
        ]);
      });

    return () => {
      cancelled = true;
    };
  }, [engineReady, listProviders, setProviders]);

  // Handle keyboard shortcuts (ink's Key type only exposes modifiers/special
  // keys, so plain characters arrive through `input`).
  useInput((input, key) => {
    if (commandPaletteOpen) return;

    const withModifier = key.meta || key.ctrl;

    // Command palette
    if (input === 'p' && withModifier) {
      setCommandPaletteOpen(true);
      return;
    }

    // New conversation
    if (input === 'n' && withModifier) {
      handleNewConversation();
      return;
    }

    // Quit
    if (input === 'q' && withModifier) {
      process.exit(0);
    }

    // Settings
    if (input === ',' && withModifier) {
      setActiveTab('settings');
      return;
    }

    // Tab switching
    if (key.tab && !key.shift) {
      const tabs = ['conversations', 'providers', 'plugins', 'settings'] as const;
      const currentIndex = tabs.indexOf(activeTab);
      setActiveTab(tabs[(currentIndex + 1) % tabs.length]);
      return;
    }

    // Theme switching
    if (input === 't' && withModifier) {
      const themeNames = Object.keys(themes) as ThemeName[];
      const currentIndex = themeNames.indexOf(themeName);
      setTheme(themeNames[(currentIndex + 1) % themeNames.length]);
      return;
    }

    // Sidebar resize
    if (key.leftArrow && key.ctrl) {
      setSidebarWidth(Math.max(20, sidebarWidth - 5));
      return;
    }
    if (key.rightArrow && key.ctrl) {
      setSidebarWidth(Math.min(60, sidebarWidth + 5));
      return;
    }
  });

  const handleNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: uuidv4(),
      title: 'New Conversation',
      messages: [],
      model: 'auto',
      provider: 'auto',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    addConversation(newConv);
    setCurrentConversation(newConv.id);
    setShowWelcome(false);
  }, [addConversation, setCurrentConversation]);

  const handleConversationSelect = useCallback((id: string) => {
    setCurrentConversation(id);
    setShowWelcome(false);
  }, [setCurrentConversation]);

  const handleConversationDelete = useCallback((id: string) => {
    removeConversation(id);
    if (conversations.length <= 1) {
      handleNewConversation();
    }
  }, [removeConversation, conversations.length, handleNewConversation]);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!current_conversation) return;

    // Slash commands are handled locally, everything else goes to the engine.
    if (text.startsWith('/')) {
      await handleSlashCommand(text);
      return;
    }

    // Add user message
    const userMsg: UIMessage = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    addMessage(current_conversation.id, userMsg);

    // Prepare messages for API
    const messages: ChatMessage[] = current_conversation.messages
      .filter(m => m.role !== 'system' || m.content)
      .map(m => {
        const msg: ChatMessage = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      });

    messages.push({ role: 'user', content: text });

    if (!engineReady) {
      setAgentStatus('error');
      const errorMsg: UIMessage = {
        id: uuidv4(),
        role: 'system',
        content: engineError
          ? `Engine unavailable: ${engineError}`
          : 'Engine is not ready yet. Please wait or restart the app.',
        timestamp: Date.now(),
        metadata: { error: true },
      };
      addMessage(current_conversation.id, errorMsg);
      return;
    }

    // Send to engine - the promise resolves only when the engine finishes the
    // response, so errors/timeouts are reported to the user here.
    try {
      await chatCompletion(
        {
          model: current_conversation.model || 'auto',
          messages: messages as any,
          stream: true,
          temperature: 0.7,
          max_tokens: 4096,
        },
        current_conversation.id
      );
      setAgentStatus('idle');
    } catch (error) {
      setAgentStatus('error');
      // Add error message
      const errorMsg: UIMessage = {
        id: uuidv4(),
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        metadata: { error: true },
      };
      addMessage(current_conversation.id, errorMsg);
    }
  }, [current_conversation, addMessage, chatCompletion, engineError, engineReady, setAgentStatus]);

  const handleSlashCommand = useCallback(
    async (text: string) => {
      const [command, ...args] = text.slice(1).split(/\s+/);
      const arg = args.join(' ').trim();

      switch (command) {
        case 'new': {
          handleNewConversation();
          break;
        }
        case 'clear': {
          if (current_conversation) {
            clearMessages(current_conversation.id);
            setAgentStatus('idle');
          }
          break;
        }
        case 'model': {
          if (!current_conversation) break;
          if (!arg) {
            addMessage(current_conversation.id, {
              id: uuidv4(),
              role: 'system',
              content: `Current model: ${current_conversation.model}. Usage: /model <name>`,
              timestamp: Date.now(),
            });
          } else {
            updateConversation(current_conversation.id, { model: arg });
          }
          break;
        }
        case 'provider': {
          if (!current_conversation) break;
          if (!arg) {
            addMessage(current_conversation.id, {
              id: uuidv4(),
              role: 'system',
              content: `Current provider: ${current_conversation.provider}. Usage: /provider <name>`,
              timestamp: Date.now(),
            });
          } else {
            updateConversation(current_conversation.id, { provider: arg });
          }
          break;
        }
        case 'theme': {
          if (arg && arg in themes) {
            setTheme(arg as ThemeName);
          } else if (current_conversation) {
            addMessage(current_conversation.id, {
              id: uuidv4(),
              role: 'system',
              content: `Unknown theme "${arg}". Available: ${Object.keys(themes).join(', ')}`,
              timestamp: Date.now(),
            });
          }
          break;
        }
        case 'export': {
          if (current_conversation) exportConversation(current_conversation);
          break;
        }
        case 'plugins':
        case 'settings': {
          setActiveTab(command === 'plugins' ? 'plugins' : 'settings');
          break;
        }
        case 'compact': {
          addMessage(current_conversation!.id, {
            id: uuidv4(),
            role: 'system',
            content: 'Compact mode is not available in this build.',
            timestamp: Date.now(),
          });
          break;
        }
        default: {
          if (!current_conversation) break;
          addMessage(current_conversation.id, {
            id: uuidv4(),
            role: 'system',
            content: `Unknown command: /${command}. Type /help to see the available commands.`,
            timestamp: Date.now(),
          });
          break;
        }
      }
    },
    [addMessage, clearMessages, current_conversation, handleNewConversation, setActiveTab, setAgentStatus, setTheme, updateConversation]
  );

  const exportConversation = useCallback((conversation: Conversation) => {
    try {
      const dir = path.join(os.homedir(), '.arx', 'exports');
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${conversation.id}.md`);
      const body = [
        `# ${conversation.title}`,
        '',
        ...conversation.messages.map((m) => `**${m.role}**: ${m.content}`),
        '',
      ].join('\n');
      writeFileSync(file, body, 'utf-8');
      addMessage(conversation.id, {
        id: uuidv4(),
        role: 'system',
        content: `Conversation exported to ${file}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      addMessage(conversation.id, {
        id: uuidv4(),
        role: 'system',
        content: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        metadata: { error: true },
      });
    }
  }, [addMessage]);

  const handleCommand = useCallback((command: string) => {
    switch (command) {
      case 'new-chat': {
        handleNewConversation();
        break;
      }
      case 'switch-model':
      case 'switch-provider': {
        setActiveTab('providers');
        break;
      }
      case 'switch-theme': {
        const themeNames = Object.keys(themes) as ThemeName[];
        const currentIndex = themeNames.indexOf(themeName);
        setTheme(themeNames[(currentIndex + 1) % themeNames.length]);
        break;
      }
      case 'settings': {
        setActiveTab('settings');
        break;
      }
      case 'plugins': {
        setActiveTab('plugins');
        break;
      }
      case 'clear-history': {
        if (current_conversation) {
          clearMessages(current_conversation.id);
          setAgentStatus('idle');
        }
        break;
      }
      case 'export': {
        if (current_conversation) exportConversation(current_conversation);
        break;
      }
      case 'help': {
        const target = current_conversation ?? conversations[0];
        if (target) {
          addMessage(target.id, {
            id: uuidv4(),
            role: 'system',
            content: [
              'Keyboard:',
              '  Ctrl+N new chat  |  Ctrl+P palette  |  Ctrl+T theme  |  Ctrl+Q quit',
              'Slash commands:',
              '  /new /clear /help /export /model <name> /provider <name> /theme <name>',
              '  /plugins /settings',
            ].join('\n'),
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'quit': {
        process.exit(0);
      }
    }
    setCommandPaletteOpen(false);
  }, [
    addMessage,
    clearMessages,
    conversations,
    current_conversation,
    exportConversation,
    handleNewConversation,
    setActiveTab,
    setAgentStatus,
    setTheme,
    themeName,
  ]);

  // Render
  const currentModel = current_conversation?.model || 'auto';
  const currentProvider = current_conversation?.provider || 'auto';

  return (
    <Box flexDirection="column" height="100%">
      {/* Welcome Banner */}
      {showWelcome && conversations.length === 0 && (
        <Fade visible={true}>
          <WelcomeBanner version={VERSION} themeName={themeName} />
        </Fade>
      )}

      {/* Engine availability notice */}
      {engineError && (
        <Box paddingX={1}>
          <Text color={theme.colors.error}>
            ⚠ Engine: {engineError}
          </Text>
        </Box>
      )}

      {/* Main Content Area */}
      <Box flexGrow={1} flexDirection="row" minHeight={0}>
        {/* Sidebar */}
        <Fade visible={true}>
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onConversationSelect={handleConversationSelect}
            onConversationDelete={handleConversationDelete}
            onNewConversation={handleNewConversation}
            width={sidebarWidth}
          />
        </Fade>

        {/* Resize Handle */}
        <Box
          width={1}
        >
          <Text color={theme.colors.text_muted} dimColor>│</Text>
        </Box>

        {/* Chat Area */}
        <Box flexGrow={1} flexDirection="column" minWidth={0} minHeight={0}>
          {/* Messages */}
          <Box flexGrow={1} padding={1} paddingBottom={0}>
            {current_conversation && !showWelcome ? (
              <Box flexDirection="column">
                {current_conversation.messages.map((msg, index) => (
                  <Message
                    key={msg.id}
                    message={msg}
                    isLast={index === current_conversation.messages.length - 1}
                  />
                ))}
                {agentStatus === 'streaming' && (
                  <Box marginTop={1} marginLeft={2}>
                    <Spinner type="dots" color={theme.colors.primary} text="Generating..." />
                  </Box>
                )}
              </Box>
            ) : (
              <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
                <GradientText colors={[theme.colors.primary, theme.colors.secondary, theme.colors.accent]} bold>
                  Select or create a conversation to start chatting
                </GradientText>
                <Text color={theme.colors.text_muted} dimColor>
                  Press ⌘N for new chat or click "+ New" in sidebar
                </Text>
              </Box>
            )}
          </Box>

          {/* Input Area */}
          <Fade visible={true}>
            <Input
              onSubmit={handleSendMessage}
              disabled={agentStatus === 'streaming' || agentStatus === 'thinking' || !engineReady}
              model={currentModel}
              provider={currentProvider}
            />
          </Fade>

          {/* Status Bar */}
          <StatusBar
            engineConnected={engine_connected}
            engineStatus={engine_status}
            agentStatus={agentStatus}
            model={currentModel}
            provider={currentProvider}
          />
        </Box>
      </Box>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelect={handleCommand}
      />
    </Box>
  );
}

// CLI Entry Point
export async function run() {
  // Enable true color support
  process.stdout.write('\x1b[?1049h'); // Enter alternate screen buffer

  const { unmount } = render(<App />);

  // Handle cleanup
  process.on('SIGINT', () => {
    unmount();
    process.stdout.write('\x1b[?1049l'); // Exit alternate screen buffer
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    unmount();
    process.stdout.write('\x1b[?1049l');
    process.exit(0);
  });
}

// Run if main module
run().catch(console.error);