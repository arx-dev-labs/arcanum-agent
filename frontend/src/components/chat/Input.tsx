// Input component with history, and slash commands (single-line)

import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../store';
import { GradientText, Pulse } from '../animated/AnimatedBox';
import type { ChatMessage } from '../../types';

interface InputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  model?: string;
  provider?: string;
}

export function Input({ onSubmit, disabled = false, placeholder, model, provider }: InputProps) {
  const theme = useTheme();
  const stdout = useStdout();
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showCommands, setShowCommands] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const textareaRef = useRef<any>(null);

  const commands = [
    { name: '/model', desc: 'Switch model', usage: '/model <name>' },
    { name: '/provider', desc: 'Switch provider', usage: '/provider <name>' },
    { name: '/theme', desc: 'Switch theme', usage: '/theme <name>' },
    { name: '/new', desc: 'New conversation', usage: '/new' },
    { name: '/clear', desc: 'Clear history', usage: '/clear' },
    { name: '/help', desc: 'Show help', usage: '/help' },
    { name: '/plugins', desc: 'Manage plugins', usage: '/plugins' },
    { name: '/settings', desc: 'Open settings', usage: '/settings' },
    { name: '/export', desc: 'Export conversation', usage: '/export' },
    { name: '/compact', desc: 'Compact mode', usage: '/compact' },
  ];

  const filteredCommands = commands.filter((c) =>
    c.name.startsWith(value.toLowerCase()) || c.desc.toLowerCase().includes(value.toLowerCase().slice(1))
  );

  // Handle input
  const handleInput = useCallback((input: string) => {
    if (disabled) return;
    setValue(input);
    setHistoryIndex(-1);
    setShowCommands(value.startsWith('/'));
    if (value.startsWith('/')) setCommandIndex(0);
  }, [disabled]);

  // Handle special keys
  useInput((input, key) => {
    if (disabled) return;

    if (key.return && (key.shift || key.meta || key.ctrl)) {
      // Shift+Enter or Meta+Enter = submit
      if (value.trim()) {
        onSubmit(value.trim());
        setHistory((prev) => [value.trim(), ...prev.slice(0, 99)]);
        setValue('');
        setShowCommands(false);
      }
      return;
    }

    if (key.return && !key.shift && !key.meta && !key.ctrl) {
      // Enter = submit (single line mode)
      if (value.trim()) {
        onSubmit(value.trim());
        setHistory((prev) => [value.trim(), ...prev.slice(0, 99)]);
        setValue('');
        setShowCommands(false);
      }
      return;
    }

    if (key.upArrow) {
      if (showCommands && filteredCommands.length > 0) {
        setCommandIndex((i) => Math.max(0, i - 1));
      } else if (history.length > 0 && historyIndex < history.length - 1) {
        setHistoryIndex((i) => i + 1);
        setValue(history[historyIndex + 1]);
      }
      return;
    }

    if (key.downArrow) {
      if (showCommands && filteredCommands.length > 0) {
        setCommandIndex((i) => Math.min(filteredCommands.length - 1, i + 1));
      } else if (historyIndex > 0) {
        setHistoryIndex((i) => i - 1);
        setValue(history[historyIndex - 1]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue('');
      }
      return;
    }

    if (key.tab && showCommands && filteredCommands.length > 0) {
      // Tab completes command
      const cmd = filteredCommands[commandIndex];
      setValue(cmd.name + ' ');
      setShowCommands(false);
      return;
    }

    if (key.escape) {
      setShowCommands(false);
      setValue('');
      return;
    }
  });

  // Focus on mount
  useEffect(() => {
    // TextInput handles focus internally
  }, []);

  return (
    <Box
      borderStyle="round"
      borderColor={disabled ? theme.colors.border : theme.colors.primary}
      padding={1}
      flexDirection="column"
    >
      {/* Model/Provider indicator */}
      <Box flexDirection="row" alignItems="center" gap={1} marginBottom={0.5}>
        <Box flexDirection="row" alignItems="center" gap={0.5} paddingX={1} paddingY={0.2}>
          <Text color={theme.colors.primary} dimColor>Model</Text>
          <Text color={theme.colors.accent} dimColor bold>{model || 'auto'}</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={0.5} paddingX={1} paddingY={0.2}>
          <Text color={theme.colors.secondary} dimColor>Provider</Text>
          <Text color={theme.colors.accent} dimColor bold>{provider || 'auto'}</Text>
        </Box>
        <Box flexGrow={1} />
        {disabled && <Pulse color={theme.colors.error}>⏳ Processing...</Pulse>}
      </Box>

      {/* Text Input */}
      <TextInput
        value={value}
        onChange={handleInput}
        onSubmit={(v) => {
          if (v.trim() && !disabled) {
            onSubmit(v.trim());
            setHistory((prev) => [v.trim(), ...prev.slice(0, 99)]);
            setValue('');
            setShowCommands(false);
          }
        }}
        placeholder={placeholder || (disabled ? 'Processing...' : 'Type your message (Enter to send, / for commands)')}
        focus={!disabled}
      />

      {/* Command suggestions */}
      {showCommands && filteredCommands.length > 0 && (
        <Box marginTop={0.5} borderStyle="single" borderTop borderTopColor={theme.colors.border} paddingTop={0.5}>
          <Text color={theme.colors.text_muted} dimColor>
            Commands:
          </Text>
          <Box flexDirection="column">
            {filteredCommands.map((cmd, i) => (
              <Box
                key={cmd.name}
                flexDirection="row"
                alignItems="center"
                gap={1}
                paddingX={1}
                paddingY={0.2}
              >
                <Text color={i === commandIndex ? theme.colors.primary : theme.colors.text_muted}>
                  {i === commandIndex ? '▸' : ' '}
                </Text>
                <GradientText colors={[theme.colors.primary, theme.colors.accent]} dimColor>
                  {cmd.name}
                </GradientText>
                <Text color={theme.colors.text_muted} dimColor>{cmd.desc}</Text>
                <Text color={theme.colors.text_muted} dimColor>{cmd.usage}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Hint */}
      <Box marginTop={0.5} flexDirection="row" alignItems="center" justifyContent="space-between">
        <Text color={theme.colors.text_muted} dimColor>
          {disabled ? 'Waiting for response...' : 'Enter to send • / for commands • ↑↓ history'}
        </Text>
        <Text color={theme.colors.text_muted} dimColor>
          {value.length} chars
        </Text>
      </Box>
    </Box>
  );
}