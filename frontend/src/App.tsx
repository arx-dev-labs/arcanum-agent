// Main App Component

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Text,
  useInput,
  useStdout,
  render,
  Color,
} from 'ink';
import { GradientText, AnimatedBox, Spinner, Pulse } from './components/animated/AnimatedBox';
import { Sidebar } from './components/layout/Sidebar';
import { Message, Input, WelcomeBanner, StatusBar, CommandPalette } from './components/chat/Message';
import { useStore } from './store';
import { useEngine } from './hooks/useEngine';
import { themes, type ThemeName } from './theme';
import type { Conversation, UIMessage } from './types';
import { v4 as uuidv4 } from 'uuid';

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
    setProviders,
    setEngineConnected,
    setEngineStatus,
    setAgentStatus,
  } = useStore();

  const { connected, engineReady, chatCompletion, request } = useEngine();
  const [activeTab, setActiveTab] = useState<'conversations' | 'providers' | 'plugins' | 'settings'>('conversations');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(35);
  const [resizeMode, setResizeMode] = useState(false);

  // Initialize engine connection
  useEffect(() => {
    setEngineConnected(connected);
    setEngineStatus(engineReady ? 'running' : 'starting');
  }, [connected, engineReady, setEngineConnected, setEngineStatus]);

  // Load providers on connect
  useEffect(() => {
    if (engineReady) {
      // Request providers from engine
      request('provider_list', {}).then((result: any) => {
        if (result.providers) {
          setProviders(result.providers);
        }
      }).catch(() => {
        // Fallback to defaults
        setProviders([
          { name: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], config: {} },
          { name: 'anthropic', models: ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus'], config: {} },
          { name: 'nvidia', models: ['nemotron-3-ultra', 'llama-3.1-405b', 'mistral-large'], config: {} },
          { name: 'custom', models: [], config: {} },
        ]);
      });
    }
  }, [engineReady, request, setProviders]);

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (commandPaletteOpen) return;

    // Command palette
    if (key.p && (key.meta || key.ctrl)) {
      setCommandPaletteOpen(true);
      return;
    }

    // New conversation
    if (key.n && (key.meta || key.ctrl)) {
      handleNewConversation();
      return;
    }

    // Quit
    if (key.q && (key.meta || key.ctrl)) {
      process.exit(0);
    }

    // Settings
    if (key.comma && (key.meta || key.ctrl)) {
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
    if (key.t && (key.meta || key.ctrl)) {
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

    // Add user message
    const userMsg: UIMessage = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    addMessage(current_conversation.id, userMsg);

    // Prepare messages for API
    const messages = current_conversation.messages
      .filter(m => m.role !== 'system' || m.content)
      .map(m => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
      }));

    messages.push({ role: 'user', content: text });

    // Send to engine
    setAgentStatus('thinking');
    try {
      await chatCompletion({
        model: current_conversation.model || 'auto',
        messages: messages as any,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      });
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
  }, [current_conversation, addMessage, chatCompletion, setAgentStatus]);

  const handleCommand = useCallback((command: string) => {
    switch (command) {
      case 'new-chat':
        handleNewConversation();
        break;
      case 'switch-model':
        setActiveTab('providers');
        break;
      case 'switch-provider':
        setActiveTab('providers');
        break;
      case 'switch-theme':
        const themeNames = Object.keys(themes) as ThemeName[];
        const currentIndex = themeNames.indexOf(themeName);
        setTheme(themeNames[(currentIndex + 1) % themeNames.length]);
        break;
      case 'settings':
        setActiveTab('settings');
        break;
      case 'plugins':
        setActiveTab('plugins');
        break;
      case 'clear-history':
        if (current_conversation) {
          // Clear messages but keep conversation
        }
        break;
      case 'help':
        // Show help
        break;
      case 'quit':
        process.exit(0);
    }
    setCommandPaletteOpen(false);
  }, [handleNewConversation, setActiveTab, themeName, setTheme, current_conversation]);

  // Render
  const currentModel = current_conversation?.model || 'auto';
  const currentProvider = current_conversation?.provider || 'auto';

  return (
    <Box flexDirection="column" height="100%" backgroundColor={theme.colors.background}>
      {/* Welcome Banner */}
      {showWelcome && conversations.length === 0 && (
        <AnimatedBox animation="slideDown" duration={500}>
          <WelcomeBanner version={VERSION} themeName={themeName} />
        </AnimatedBox>
      )}

      {/* Main Content Area */}
      <Box flex="1" flexDirection="row" minHeight={0}>
        {/* Sidebar */}
        <AnimatedBox animation="slideLeft" duration={300}>
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onConversationSelect={handleConversationSelect}
            onConversationDelete={handleConversationDelete}
            onNewConversation={handleNewConversation}
            width={sidebarWidth}
          />
        </AnimatedBox>

        {/* Resize Handle */}
        <Box
          width={1}
          backgroundColor={resizeMode ? theme.colors.primary : theme.colors.border}
          onMouseDown={() => setResizeMode(true)}
          onMouseUp={() => setResizeMode(false)}
          onMouseLeave={() => setResizeMode(false)}
        >
          <Text style={{ color: theme.colors.text_muted }}>│</Text>
        </Box>

        {/* Chat Area */}
        <Box flex="1" flexDirection="column" minWidth={0} minHeight={0}>
          {/* Messages */}
          <Box flex="1" overflowY="auto" padding={1} paddingBottom={0}>
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
              <Box flex="1" flexDirection="column" alignItems="center" justifyContent="center">
                <GradientText colors={[theme.colors.primary, theme.colors.secondary, theme.colors.accent]} bold>
                  Select or create a conversation to start chatting
                </GradientText>
                <Text style={{ color: theme.colors.text_muted, marginTop: 1 }}>
                  Press ⌘N for new chat or click "+ New" in sidebar
                </Text>
              </Box>
            )}
          </Box>

          {/* Input Area */}
          <AnimatedBox animation="slideUp" duration={200}>
            <Input
              onSubmit={handleSendMessage}
              disabled={agentStatus === 'streaming' || agentStatus === 'thinking' || !engineReady}
              model={currentModel}
              provider={currentProvider}
            />
          </AnimatedBox>

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
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error);
}