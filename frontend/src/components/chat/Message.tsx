// Message components for chat display

import { Box, Text, useInput, useStdout } from 'ink';
import { useState, useMemo } from 'react';
import { TypingText, GradientText, Pulse } from '../animated/AnimatedBox';
import { useTheme } from '../../store';
import type { UIMessage, ToolCall, ToolResult } from '../../types';

interface MessageProps {
  message: UIMessage;
  isLast?: boolean;
  compact?: boolean;
}

export function Message({ message, isLast = false, compact = false }: MessageProps) {
  const theme = useTheme();
  const stdout = useStdout();
  const [showFull, setShowFull] = useState(false);

  const roleColors = {
    user: theme.colors.primary,
    assistant: theme.colors.secondary,
    system: theme.colors.info,
    tool: theme.colors.warning,
  };

  const roleIcons = {
    user: '▸',
    assistant: '◂',
    system: '●',
    tool: '⚙',
  };

  const roleLabels = {
    user: 'You',
    assistant: 'ARX',
    system: 'System',
    tool: 'Tool',
  };

  const color = roleColors[message.role] || theme.colors.text;
  const icon = roleIcons[message.role] || '•';
  const label = roleLabels[message.role] || message.role;

  // Handle streaming content with typing effect
  const isStreaming = message.streaming;
  const content = message.content;

  return (
    <Box
      marginTop={compact ? 0 : 1}
      marginBottom={isLast && !compact ? 1 : 0}
      paddingLeft={2}
      borderStyle="single"
      borderLeft
      borderLeftColor={color + '44'}
    >
      {/* Header */}
      <Box flexDirection="row" alignItems="center" gap={1} marginBottom={compact ? 0 : 0.5}>
        <Text color={color} bold>{icon}</Text>
        <Text color={color} bold>{label}</Text>
        <Text color={theme.colors.text_muted} dimColor>{new Date(message.timestamp).toLocaleTimeString()}</Text>
        {message.streaming && <Pulse color={color} speed={800}>●</Pulse>}
      </Box>

      {/* Content */}
      <Box marginLeft={2}>
        {isStreaming ? (
          <TypingText text={content} speed={15} />
        ) : (
          <Text color={theme.colors.text} wrap="wrap">{content}</Text>
        )}

        {/* Tool calls */}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <Box marginTop={1}>
            {message.tool_calls.map((tc: ToolCall) => (
              <ToolCallDisplay key={tc.id} toolCall={tc} />
            ))}
          </Box>
        )}

        {/* Tool results */}
        {message.tool_results && message.tool_results.length > 0 && (
          <Box marginTop={1}>
            {message.tool_results.map((tr: ToolResult) => (
              <ToolResultDisplay key={tr.tool_call_id} result={tr} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// Tool Call Display
interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const theme = useTheme();

  try {
    const args = JSON.parse(toolCall.function.arguments);
    return (
      <Box marginTop={0.5} paddingLeft={1} borderStyle="single" borderLeft borderLeftColor={theme.colors.warning + '88'}>
        <Box flexDirection="row" gap={1}>
          <Text color={theme.colors.warning}>⚡</Text>
          <Text color={theme.colors.text_muted} dimColor>Calling</Text>
          <GradientText colors={[theme.colors.warning, theme.colors.accent]}>{toolCall.function.name}</GradientText>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.colors.text_muted} dimColor>{JSON.stringify(args, null, 2)}</Text>
        </Box>
      </Box>
    );
  } catch {
    return (
      <Box marginTop={0.5} paddingLeft={1} borderStyle="single" borderLeft borderLeftColor={theme.colors.warning + '88'}>
        <Text color={theme.colors.warning}>⚡ {toolCall.function.name}</Text>
      </Box>
    );
  }
}

// Tool Result Display
interface ToolResultDisplayProps {
  result: ToolResult;
}

function ToolResultDisplay({ result }: ToolResultDisplayProps) {
  const theme = useTheme();
  const isError = !!result.error;

  return (
    <Box marginTop={0.5} paddingLeft={1} borderStyle="single" borderLeft borderLeftColor={(isError ? theme.colors.error : theme.colors.success) + '88'}>
      <Box flexDirection="row" gap={1}>
        <Text color={isError ? theme.colors.error : theme.colors.success}>
          {isError ? '✗' : '✓'}
        </Text>
        <Text color={theme.colors.text_muted} dimColor>Result from</Text>
        <Text color={theme.colors.accent}>{result.name}</Text>
      </Box>
      <Box marginLeft={2} marginTop={0.5}>
        <Text color={isError ? theme.colors.error : theme.colors.text} dimColor>
          {isError ? result.error : JSON.stringify(result.result, null, 2)}
        </Text>
      </Box>
    </Box>
  );
}

// Conversation List Item
interface ConversationItemProps {
  conversation: import('../../types').Conversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function ConversationItem({ conversation, active, onSelect, onDelete }: ConversationItemProps) {
  const theme = useTheme();
  const [hover, setHover] = useState(false);

  useInput((input, key) => {
    if (hover && key.return) onSelect();
    if (hover && key.delete) onDelete();
  });

  return (
    <Box
      paddingX={1}
      paddingY={0.5}
      borderStyle="single" borderLeft={Boolean(active)} borderLeftColor={theme.colors.primary}
    >
      <Box flexDirection="row" alignItems="center" justifyContent="space-between">
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text color={active ? theme.colors.primary : theme.colors.text_muted}>
            {active ? '▸' : '•'}
          </Text>
          <Text color={active ? theme.colors.text : theme.colors.text_muted} bold={active}>
            {conversation.title || 'New Conversation'}
          </Text>
        </Box>
        {hover && (
          <Text color={theme.colors.error}>✕</Text>
        )}
      </Box>
      <Text color={theme.colors.text_muted} dimColor>
        {conversation.model} • {conversation.messages.length} msgs
      </Text>
    </Box>
  );
}

// Welcome/Banner Component
interface WelcomeBannerProps {
  version: string;
  themeName: string;
}

export function WelcomeBanner({ version, themeName }: WelcomeBannerProps) {
  const theme = useTheme();

  return (
    <Box
      padding={2}
      marginBottom={1}
      borderStyle="round"
      borderColor={theme.colors.border}
    >
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" marginBottom={1}>
        <GradientText colors={[theme.colors.primary, theme.colors.secondary, theme.colors.accent]} bold>
          ARX
        </GradientText>
        <Text color={theme.colors.text_muted} dimColor>v{version}</Text>
      </Box>

      <Box flexDirection="row" gap={2} flexWrap="wrap">
        <Box>
          <Text color={theme.colors.text_muted} dimColor>Theme:</Text>
          <GradientText>{themeName}</GradientText>
        </Box>
        <Box>
          <Text color={theme.colors.text_muted} dimColor>Providers:</Text>
          <Text color={theme.colors.accent}>OpenAI, Anthropic, NVIDIA, Custom</Text>
        </Box>
        <Box>
          <Text color={theme.colors.text_muted} dimColor>Shortcuts:</Text>
          <Text color={theme.colors.text}>⌘N New • ⌘P Palette • ⌘, Settings</Text>
        </Box>
      </Box>
    </Box>
  );
}

// Status Bar
interface StatusBarProps {
  engineConnected: boolean;
  engineStatus: string;
  agentStatus: string;
  model: string;
  provider: string;
  tokens?: number;
}

export function StatusBar({
  engineConnected,
  engineStatus,
  agentStatus,
  model,
  provider,
  tokens,
}: StatusBarProps) {
  const theme = useTheme();

  const statusColors = {
    idle: theme.colors.text_muted,
    thinking: theme.colors.warning,
    streaming: theme.colors.primary,
    tool_calling: theme.colors.accent,
    error: theme.colors.error,
  };

  const statusIcons = {
    idle: '○',
    thinking: '◐',
    streaming: '◉',
    tool_calling: '⚙',
    error: '✗',
  };

  const statusColor = statusColors[agentStatus as keyof typeof statusColors] || theme.colors.text_muted;
  const statusIcon = statusIcons[agentStatus as keyof typeof statusIcons] || '○';

  return (
    <Box
      paddingX={1}
      paddingY={0.5}
      borderStyle="single"
      borderTop
      borderTopColor={theme.colors.border}
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
    >
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Text color={engineConnected ? theme.colors.success : theme.colors.error}>
          {engineConnected ? '●' : '○'}
        </Text>
        <Text color={theme.colors.text_muted} dimColor>{engineStatus.toUpperCase()}</Text>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text color={statusColor} dimColor>{agentStatus.toUpperCase()}</Text>
      </Box>

      <Box flexDirection="row" alignItems="center" gap={2}>
        <Box flexDirection="row" alignItems="center" gap={0.5}>
          <Text color={theme.colors.text_muted} dimColor>Model:</Text>
          <Text color={theme.colors.accent} dimColor bold>{model}</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={0.5}>
          <Text color={theme.colors.text_muted} dimColor>Provider:</Text>
          <Text color={theme.colors.primary} dimColor>{provider}</Text>
        </Box>
        {tokens !== undefined && (
          <Box flexDirection="row" alignItems="center" gap={0.5}>
            <Text color={theme.colors.text_muted} dimColor>Tokens:</Text>
            <Text color={theme.colors.warning} dimColor>{tokens.toLocaleString()}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// Command Palette
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (command: string) => void;
}

export function CommandPalette({ open, onClose, onSelect }: CommandPaletteProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = [
    { id: 'new-chat', label: 'New Chat', desc: 'Start a new conversation', keys: '⌘N' },
    { id: 'switch-model', label: 'Switch Model', desc: 'Change the AI model', keys: '⌘M' },
    { id: 'switch-provider', label: 'Switch Provider', desc: 'Change AI provider', keys: '⌘P' },
    { id: 'switch-theme', label: 'Switch Theme', desc: 'Change color theme', keys: '⌘T' },
    { id: 'settings', label: 'Settings', desc: 'Open settings', keys: '⌘,' },
    { id: 'plugins', label: 'Plugins', desc: 'Manage plugins', keys: '⌘L' },
    { id: 'clear-history', label: 'Clear History', desc: 'Clear conversation history', keys: '' },
    { id: 'export', label: 'Export Chat', desc: 'Export conversation', keys: '' },
    { id: 'help', label: 'Help', desc: 'Show help', keys: '⌘?' },
    { id: 'quit', label: 'Quit', desc: 'Exit Arcanum', keys: '⌘Q' },
  ];

  const filtered = commands.filter(
    (c) => c.label.toLowerCase().includes(query.toLowerCase()) || c.desc.toLowerCase().includes(query.toLowerCase())
  );

  useInput((input, key) => {
    if (!open) return;
    if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
    if (key.return && filtered[selectedIndex]) {
      onSelect(filtered[selectedIndex].id);
      onClose();
    }
    if (key.escape) onClose();
    if (input) setQuery(query + input);
    if (key.backspace) setQuery(query.slice(0, -1));
  });

  if (!open) return null;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.colors.primary}
      padding={1}
    >
      <Box flexDirection="row" alignItems="center" gap={1} marginBottom={1}>
        <Text color={theme.colors.primary}>⌘</Text>
        <Text color={theme.colors.text}>Command Palette</Text>
        <Box flexGrow={1} />
        <Text color={theme.colors.text_muted} dimColor>ESC to close</Text>
      </Box>

      <Box marginBottom={1} borderStyle="single"
      borderBottom
      borderBottomColor={theme.colors.border}>
        <Text color={theme.colors.primary}>› </Text>
        <Text color={theme.colors.text}>{query}</Text>
        <Text color={theme.colors.primary} dimColor>█</Text>
      </Box>

      <Box flexDirection="column">
        {filtered.map((cmd, i) => (
          <Box
            key={cmd.id}
            paddingX={1}
            paddingY={0.3}
            flexDirection="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box flexDirection="row" gap={1}>
              <Text color={i === selectedIndex ? theme.colors.primary : theme.colors.text_muted}>
                {i === selectedIndex ? '▸' : ' '}
              </Text>
              <Text color={i === selectedIndex ? theme.colors.text : theme.colors.text_muted} bold={i === selectedIndex}>
                {cmd.label}
              </Text>
              <Text color={theme.colors.text_muted} dimColor>({cmd.desc})</Text>
            </Box>
            {cmd.keys && <Text color={theme.colors.text_muted} dimColor>{cmd.keys}</Text>}
          </Box>
        ))}
        {filtered.length === 0 && (
          <Box padding={1}>
            <Text color={theme.colors.text_muted} dimColor>No commands found</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}