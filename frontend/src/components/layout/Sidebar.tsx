// Sidebar with conversations, providers, plugins

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useStore, useTheme, useThemeName, useProviders, usePlugins, useConfig } from '../../store';
import { GradientText } from '../animated/AnimatedBox';
import type { Conversation, Provider, Plugin } from '../../types';

interface SidebarProps {
  activeTab: 'conversations' | 'providers' | 'plugins' | 'settings';
  onTabChange: (tab: 'conversations' | 'providers' | 'plugins' | 'settings') => void;
  onConversationSelect: (id: string) => void;
  onConversationDelete: (id: string) => void;
  onNewConversation: () => void;
  width?: number;
}

export function Sidebar({
  activeTab,
  onTabChange,
  onConversationSelect,
  onConversationDelete,
  onNewConversation,
  width = 35,
}: SidebarProps) {
  const theme = useTheme();
  const conversations = useStore((s) => s.conversations);
  const providers = useProviders();
  const plugins = usePlugins();
  const currentConversation = useStore((s) => s.current_conversation);
  const themeName = useThemeName();
  const setTheme = useStore((s) => s.setTheme);
  const config = useConfig();

  const [conversationHover, setConversationHover] = useState<string | null>(null);
  const [providerHover, setProviderHover] = useState<string | null>(null);

  const tabs = [
    { id: 'conversations', label: 'Chats', icon: '💬', count: conversations.length },
    { id: 'providers', label: 'Models', icon: '🧠', count: providers.length },
    { id: 'plugins', label: 'Plugins', icon: '🔌', count: plugins.length },
    { id: 'settings', label: 'Settings', icon: '⚙', count: 0 },
  ] as const;

  useInput((input, key) => {
    if (key.leftArrow) {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
      onTabChange(prev.id as typeof activeTab);
    }
    if (key.rightArrow) {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      const next = tabs[(currentIndex + 1) % tabs.length];
      onTabChange(next.id as typeof activeTab);
    }
    if (input === 'n' && (key.meta || key.ctrl)) {
      onNewConversation();
    }
  });

  return (
    <Box
      width={width}
      height="100%"
      borderStyle="single" borderRight borderRightColor={theme.colors.border}
      flexDirection="column"
    >
      {/* Tab Bar */}
      <Box
        flexDirection="row"
        borderStyle="single" borderBottom borderBottomColor={theme.colors.border}
        paddingX={1}
      >
        {tabs.map((tab) => (
          <Box
            key={tab.id}
            flexDirection="row"
            alignItems="center"
            gap={0.5}
            paddingX={1}
            paddingY={0.5}
            borderStyle="single" borderBottom={activeTab === tab.id} borderBottomColor={theme.colors.primary}
          >
            <Text color={activeTab === tab.id ? theme.colors.primary : theme.colors.text_muted}>
              {tab.icon}
            </Text>
            <Text color={activeTab === tab.id ? theme.colors.text : theme.colors.text_muted} bold={activeTab === tab.id}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <Box
                paddingX={0.5}
                paddingY={0.1}
              >
                <Text color={theme.colors.background} dimColor bold>{tab.count}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Tab Content */}
      <Box flexGrow={1}>
        {activeTab === 'conversations' && (
          <ConversationsPanel
            conversations={conversations}
            currentConversation={currentConversation}
            onSelect={onConversationSelect}
            onDelete={onConversationDelete}
            onNew={onNewConversation}
            hover={conversationHover}
            setHover={setConversationHover}
          />
        )}

        {activeTab === 'providers' && (
          <ProvidersPanel
            providers={providers}
            hover={providerHover}
            setHover={setProviderHover}
            config={config}
          />
        )}

        {activeTab === 'plugins' && <PluginsPanel plugins={plugins} />}

        {activeTab === 'settings' && <SettingsPanel themeName={themeName} setTheme={setTheme} />}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderTop borderTopColor={theme.colors.border} padding={1}>
        <Text color={theme.colors.text_muted} dimColor>ARX CLI v1.0.0</Text>
      </Box>
    </Box>
  );
}

// Conversations Panel
interface ConversationsPanelProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  hover: string | null;
  setHover: (id: string | null) => void;
}

function ConversationsPanel({
  conversations,
  currentConversation,
  onSelect,
  onDelete,
  onNew,
  hover,
  setHover,
}: ConversationsPanelProps) {
  const theme = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={1}>
        <Text color={theme.colors.text} bold>Conversations</Text>
        <Box
          paddingX={1}
          paddingY={0.3}
        >
          <Text color={theme.colors.primary} dimColor bold>+ New</Text>
        </Box>
      </Box>

      {conversations.length === 0 ? (
        <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
          <Text color={theme.colors.text_muted} dimColor>No conversations yet</Text>
          <Text color={theme.colors.text_muted} dimColor>Press ⌘N to start</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {conversations.map((conv) => (
            <Box
              key={conv.id}
              paddingX={1}
              paddingY={0.5}
              marginBottom={0.3}
              borderStyle="single" borderLeft={currentConversation?.id === conv.id} borderLeftColor={theme.colors.primary}
            >
              <Box flexDirection="row" alignItems="center" justifyContent="space-between">
                <Box flexDirection="row" alignItems="center" gap={1}>
                  <Text color={currentConversation?.id === conv.id ? theme.colors.primary : theme.colors.text_muted}>
                    {currentConversation?.id === conv.id ? '▸' : '•'}
                  </Text>
                  <Text color={currentConversation?.id === conv.id ? theme.colors.text : theme.colors.text_muted} bold={currentConversation?.id === conv.id}>
                    {conv.title || 'Untitled'}
                  </Text>
                </Box>
                {hover === conv.id && (
                  <Box
                    paddingX={0.5}
                    paddingY={0.1}
                  >
                    <Text color={theme.colors.error} dimColor>✕</Text>
                  </Box>
                )}
              </Box>
              <Text color={theme.colors.text_muted} dimColor>
                {conv.model} • {new Date(conv.updated_at).toLocaleDateString()}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// Providers Panel
interface ProvidersPanelProps {
  providers: Provider[];
  hover: string | null;
  setHover: (id: string | null) => void;
  config: any;
}

function ProvidersPanel({ providers, hover, setHover, config }: ProvidersPanelProps) {
  const theme = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={theme.colors.text} bold>Providers</Text>

      {providers.length === 0 ? (
        <Text color={theme.colors.text_muted} dimColor>No providers configured</Text>
      ) : (
        <Box flexDirection="column">
          {providers.map((provider) => (
            <Box
              key={provider.name}
              padding={1}
              marginBottom={0.5}
              borderStyle="round"
              borderColor={config?.provider_configs?.[provider.name]?.api_key ? theme.colors.success + '44' : theme.colors.border}
            >
              <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={0.5}>
                <GradientText colors={[theme.colors.primary, theme.colors.secondary]}>{provider.name}</GradientText>
                {config?.provider_configs?.[provider.name]?.api_key && (
                  <Text color={theme.colors.success} dimColor>✓ Connected</Text>
                )}
              </Box>
              <Text color={theme.colors.text_muted} dimColor>
                {provider.models.length} models available
              </Text>
              <Box flexDirection="row" flexWrap="wrap" gap={0.5}>
                {provider.models.slice(0, 5).map((model) => (
                  <Box
                    key={model}
                    paddingX={0.5}
                    paddingY={0.2}
                  >
                    <Text color={theme.colors.text} dimColor>{model}</Text>
                  </Box>
                ))}
                {provider.models.length > 5 && (
                  <Text color={theme.colors.text_muted} dimColor>+{provider.models.length - 5} more</Text>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// Plugins Panel
interface PluginsPanelProps {
  plugins: Plugin[];
}

function PluginsPanel({ plugins }: PluginsPanelProps) {
  const theme = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={theme.colors.text} bold>Plugins</Text>

      {plugins.length === 0 ? (
        <Text color={theme.colors.text_muted} dimColor>No plugins loaded</Text>
      ) : (
        <Box flexDirection="column">
          {plugins.map((plugin) => (
            <Box
              key={plugin.name}
              padding={1}
              marginBottom={0.5}
              borderStyle="round"
              borderColor={theme.colors.border}
            >
              <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={0.5}>
                <Text color={theme.colors.text} bold>{plugin.name}</Text>
                <Text color={theme.colors.text_muted} dimColor>v{plugin.version}</Text>
              </Box>
              <Text color={theme.colors.text_muted} dimColor>
                {plugin.description}
              </Text>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {Object.keys(plugin.capabilities).map((cap) => (
                  <Box
                    key={cap}
                    paddingX={0.5}
                    paddingY={0.1}
                  >
                    <Text color={theme.colors.primary} dimColor>{cap}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// Settings Panel
interface SettingsPanelProps {
  themeName: string;
  setTheme: (name: string) => void;
}

function SettingsPanel({ themeName, setTheme }: SettingsPanelProps) {
  const theme = useTheme();

  const themes = ['cyberpunk', 'ocean', 'forest', 'mono', 'sunset', 'matrix', 'dracula', 'nord'];

  return (
    <Box flexDirection="column" padding={1}>
      <Text color={theme.colors.text} bold>Settings</Text>

      <Box marginBottom={1}>
        <Text color={theme.colors.text_muted} dimColor>Theme</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={0.5}>
          {themes.map((t) => (
            <Box
              key={t}
              paddingX={1}
              paddingY={0.3}
              borderStyle="round"
              borderColor={themeName === t ? theme.colors.primary : 'transparent'}
            >
              <Text color={themeName === t ? theme.colors.background : theme.colors.text} dimColor bold={themeName === t}>
                {t}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text color={theme.colors.text_muted} dimColor>Data Directory</Text>
        <Text color={theme.colors.text} dimColor>
          ~/.arx
        </Text>
      </Box>

      <Box>
        <Text color={theme.colors.text_muted} dimColor>Shortcuts</Text>
        <Box flexDirection="column" gap={0.3}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={theme.colors.text_muted} dimColor>New Chat</Text>
            <Text color={theme.colors.accent} dimColor>⌘N</Text>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={theme.colors.text_muted} dimColor>Command Palette</Text>
            <Text color={theme.colors.accent} dimColor>⌘P</Text>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={theme.colors.text_muted} dimColor>Settings</Text>
            <Text color={theme.colors.accent} dimColor>⌘,</Text>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={theme.colors.text_muted} dimColor>Quit</Text>
            <Text color={theme.colors.accent} dimColor>⌘Q</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}