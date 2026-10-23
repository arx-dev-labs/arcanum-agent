// Sidebar with conversations, providers, plugins

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useStore } from '../../store';
import { GradientText, AnimatedBox } from '../animated/AnimatedBox';
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
  const { theme } = useTheme();
  const conversations = useStore((s) => s.conversations);
  const providers = useStore((s) => s.providers);
  const plugins = useStore((s) => s.plugins);
  const currentConversation = useStore((s) => s.current_conversation);

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
    if (key.n && (key.meta || key.ctrl)) {
      onNewConversation();
    }
  });

  return (
    <Box
      width={width}
      height="100%"
      backgroundColor={theme.colors.surface}
      borderRight={{ width: 1, color: theme.colors.border }}
      flexDirection="column"
    >
      {/* Tab Bar */}
      <Box
        flexDirection="row"
        borderBottom={{ width: 1, color: theme.colors.border }}
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
            backgroundColor={activeTab === tab.id ? theme.colors.primary + '22' : 'transparent'}
            borderBottom={{ width: activeTab === tab.id ? 2 : 0, color: theme.colors.primary }}
            onClick={() => onTabChange(tab.id)}
          >
            <Text style={{ color: activeTab === tab.id ? theme.colors.primary : theme.colors.text_muted }}>
              {tab.icon}
            </Text>
            <Text
              style={{
                color: activeTab === tab.id ? theme.colors.text : theme.colors.text_muted,
                bold: activeTab === tab.id,
              }}
            >
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <Box
                backgroundColor={activeTab === tab.id ? theme.colors.primary : theme.colors.border}
                paddingX={0.5}
                paddingY={0.1}
              >
                <Text style={{ color: theme.colors.background, fontSize: 'small', bold: true }}>
                  {tab.count}
                </Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Tab Content */}
      <Box flex="1" overflowY="auto">
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
          />
        )}

        {activeTab === 'plugins' && (
          <PluginsPanel plugins={plugins} />
        )}

        {activeTab === 'settings' && <SettingsPanel />}
      </Box>

      {/* Footer */}
      <Box borderTop={{ width: 1, color: theme.colors.border }} padding={1}>
        <Text style={{ color: theme.colors.text_muted, fontSize: 'small', textAlign: 'center' }}>
          ARX CLI v1.0.0
        </Text>
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
  const { theme } = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={1}>
        <Text style={{ color: theme.colors.text, bold: true }}>Conversations</Text>
        <Box
          paddingX={1}
          paddingY={0.3}
          backgroundColor={theme.colors.primary + '22'}
          onClick={onNew}
        >
          <Text style={{ color: theme.colors.primary, fontSize: 'small', bold: true }}>+ New</Text>
        </Box>
      </Box>

      {conversations.length === 0 ? (
        <Box flex="1" flexDirection="column" alignItems="center" justifyContent="center">
          <Text style={{ color: theme.colors.text_muted }}>No conversations yet</Text>
          <Text style={{ color: theme.colors.text_muted, fontSize: 'small' }}>Press ⌘N to start</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {conversations.map((conv) => (
            <Box
              key={conv.id}
              paddingX={1}
              paddingY={0.5}
              marginBottom={0.3}
              backgroundColor={
                currentConversation?.id === conv.id
                  ? theme.colors.primary + '22'
                  : hover === conv.id
                  ? theme.colors.surface
                  : 'transparent'
              }
              borderLeft={{ width: currentConversation?.id === conv.id ? 3 : 0, color: theme.colors.primary }}
              onClick={() => onSelect(conv.id)}
              onFocus={() => setHover(conv.id)}
              onBlur={() => setHover(null)}
            >
              <Box flexDirection="row" alignItems="center" justifyContent="space-between">
                <Box flexDirection="row" alignItems="center" gap={1}>
                  <Text style={{ color: currentConversation?.id === conv.id ? theme.colors.primary : theme.colors.text_muted }}>
                    {currentConversation?.id === conv.id ? '▸' : '•'}
                  </Text>
                  <Text
                    style={{
                      color: currentConversation?.id === conv.id ? theme.colors.text : theme.colors.text_muted,
                      bold: currentConversation?.id === conv.id,
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {conv.title || 'Untitled'}
                  </Text>
                </Box>
                {hover === conv.id && (
                  <Box
                    paddingX={0.5}
                    paddingY={0.1}
                    backgroundColor={theme.colors.error + '22'}
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  >
                    <Text style={{ color: theme.colors.error, fontSize: 'small' }}>✕</Text>
                  </Box>
                )}
              </Box>
              <Text style={{ color: theme.colors.text_muted, fontSize: 'small', marginLeft: 2 }}>
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
}

function ProvidersPanel({ providers, hover, setHover }: ProvidersPanelProps) {
  const { theme } = useTheme();
  const currentProvider = useStore((s) => s.config?.provider_configs);

  return (
    <Box flexDirection="column" padding={1}>
      <Text style={{ color: theme.colors.text, bold: true, marginBottom: 1 }}>Providers</Text>

      {providers.length === 0 ? (
        <Text style={{ color: theme.colors.text_muted }}>No providers configured</Text>
      ) : (
        <Box flexDirection="column">
          {providers.map((provider) => (
            <Box
              key={provider.name}
              padding={1}
              marginBottom={0.5}
              backgroundColor={hover === provider.name ? theme.colors.surface : 'transparent'}
              borderStyle="round"
              borderColor={currentProvider?.[provider.name]?.api_key ? theme.colors.success + '44' : theme.colors.border}
              onFocus={() => setHover(provider.name)}
              onBlur={() => setHover(null)}
            >
              <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={0.5}>
                <GradientText colors={[theme.colors.primary, theme.colors.secondary]}>{provider.name}</GradientText>
                {currentProvider?.[provider.name]?.api_key && (
                  <Text style={{ color: theme.colors.success, fontSize: 'small' }}>✓ Connected</Text>
                )}
              </Box>
              <Text style={{ color: theme.colors.text_muted, fontSize: 'small', marginBottom: 0.5 }}>
                {provider.models.length} models available
              </Text>
              <Box flexDirection="row" flexWrap="wrap" gap={0.5}>
                {provider.models.slice(0, 5).map((model) => (
                  <Box
                    key={model}
                    paddingX={0.5}
                    paddingY={0.2}
                    backgroundColor={theme.colors.border}
                  >
                    <Text style={{ color: theme.colors.text, fontSize: 'small' }}>{model}</Text>
                  </Box>
                ))}
                {provider.models.length > 5 && (
                  <Text style={{ color: theme.colors.text_muted, fontSize: 'small' }}>
                    +{provider.models.length - 5} more
                  </Text>
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
  const { theme } = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      <Text style={{ color: theme.colors.text, bold: true, marginBottom: 1 }}>Plugins</Text>

      {plugins.length === 0 ? (
        <Text style={{ color: theme.colors.text_muted }}>No plugins loaded</Text>
      ) : (
        <Box flexDirection="column">
          {plugins.map((plugin) => (
            <Box
              key={plugin.name}
              padding={1}
              marginBottom={0.5}
              backgroundColor={theme.colors.surface}
              borderStyle="round"
              borderColor={theme.colors.border}
            >
              <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={0.5}>
                <Text style={{ color: theme.colors.text, bold: true }}>{plugin.name}</Text>
                <Text style={{ color: theme.colors.text_muted, fontSize: 'small' }}>v{plugin.version}</Text>
              </Box>
              <Text style={{ color: theme.colors.text_muted, fontSize: 'small', marginBottom: 0.5 }}>
                {plugin.description}
              </Text>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {Object.keys(plugin.capabilities).map((cap) => (
                  <Box
                    key={cap}
                    paddingX={0.5}
                    paddingY={0.1}
                    backgroundColor={theme.colors.primary + '22'}
                  >
                    <Text style={{ color: theme.colors.primary, fontSize: 'small' }}>{cap}</Text>
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
function SettingsPanel() {
  const { theme } = useTheme();
  const themeName = useStore((s) => s.themeName);
  const setTheme = useStore((s) => s.setTheme);

  const themes = ['cyberpunk', 'ocean', 'forest', 'mono', 'sunset', 'matrix', 'dracula', 'nord'];

  return (
    <Box flexDirection="column" padding={1}>
      <Text style={{ color: theme.colors.text, bold: true, marginBottom: 1 }}>Settings</Text>

      <Box marginBottom={1}>
        <Text style={{ color: theme.colors.text_muted, marginBottom: 0.5 }}>Theme</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={0.5}>
          {themes.map((t) => (
            <Box
              key={t}
              paddingX={1}
              paddingY={0.3}
              backgroundColor={themeName === t ? theme.colors.primary : theme.colors.border}
              borderStyle="round"
              borderColor={themeName === t ? theme.colors.primary : 'transparent'}
              onClick={() => setTheme(t as any)}
            >
              <Text style={{ color: themeName === t ? theme.colors.background : theme.colors.text, fontSize: 'small', bold: themeName === t }}>
                {t}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text style={{ color: theme.colors.text_muted, marginBottom: 0.5 }}>Data Directory</Text>
        <Text style={{ color: theme.colors.text, fontSize: 'small', fontFamily: 'monospace' }}>
          ~/.arx
        </Text>
      </Box>

      <Box>
        <Text style={{ color: theme.colors.text_muted, marginBottom: 0.5 }}>Shortcuts</Text>
        <Box flexDirection="column" gap={0.3} fontSize="small">
          <Box flexDirection="row" justifyContent="space-between">
            <Text style={{ color: theme.colors.text_muted }}>New Chat</Text>
            <Text style={{ color: theme.colors.accent }}>⌘N</Text>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Text style={{ color: theme.colors.text_muted }}>Command Palette</Text>
            <Text style={{ color: theme.colors.accent }}>⌘P</Text>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Text style={{ color: theme.colors.text_muted }}>Settings</Text>
            <Text style={{ color: theme.colors.accent }}>⌘,</Text>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Text style={{ color: theme.colors.text_muted }}>Quit</Text>
            <Text style={{ color: theme.colors.accent }}>⌘Q</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

