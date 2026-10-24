// Animated components for Ink TUI

import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../store';

// Typing Text with typewriter effect
interface TypingTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

export function TypingText({ text, speed = 30, onComplete }: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const theme = useTheme();

  useEffect(() => {
    if (index < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(text.slice(0, index + 1));
        setIndex(index + 1);
      }, speed);
      return () => clearTimeout(timer);
    } else if (onComplete) {
      onComplete();
    }
  }, [index, text, speed, onComplete]);

  // Reset when text changes
  useEffect(() => {
    setDisplayedText('');
    setIndex(0);
  }, [text]);

  return <Text color={theme.colors.text}>{displayedText}</Text>;
}

// Gradient Text - using ink-gradient approach
interface GradientTextProps {
  children: React.ReactNode;
  colors?: string[];
  dimColor?: boolean;
  bold?: boolean;
}

export function GradientText({ children, colors, dimColor, bold = true }: GradientTextProps) {
  const theme = useTheme();
  const gradientColors = colors || [theme.colors.primary, theme.colors.secondary, theme.colors.accent];

  // For Ink, we can't do CSS gradients. We'll use alternating colors for each character
  // or use the first color as a simple approach
  const color = gradientColors[0];

  return (
    <Text color={color} bold={bold} dimColor={dimColor}>
      {children}
    </Text>
  );
}

// Pulsing/breathing animation using blink
interface PulseProps {
  children: React.ReactNode;
  color?: string;
  speed?: number;
}

export function Pulse({ children, color, speed = 1000 }: PulseProps) {
  const theme = useTheme();
  const pulseColor = color || theme.colors.primary;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => !v);
    }, speed);
    return () => clearInterval(interval);
  }, [speed]);

  if (!visible) {
    return <Text color={pulseColor} dimColor>{' '}</Text>;
  }

  return <Text color={pulseColor} bold>{children}</Text>;
}

// Spinner with custom frames
interface SpinnerProps {
  type?: 'dots' | 'line' | 'pipe' | 'bouncingBar' | 'bouncingBall' | 'earth' | 'moon' | 'clock' | 'hearts';
  color?: string;
  text?: string;
}

const spinners = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['|', '/', '-', '\\'],
  pipe: ['┤', '┘', '┴', '└', '├', '┌', '┬', '┐'],
  bouncingBar: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]', '[    ]'],
  bouncingBall: ['( ●    )', '(  ●   )', '(   ●  )', '(    ● )', '(   ●  )', '(  ●   )'],
  earth: ['🌍', '🌎', '🌏'],
  moon: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
  clock: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛'],
  hearts: ['💖', '💗', '💓', '💗', '💖'],
};

export function Spinner({ type = 'dots', color, text }: SpinnerProps) {
  const theme = useTheme();
  const frames = spinners[type];
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, [frames.length]);

  const spinnerColor = color || theme.colors.primary;

  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Text color={spinnerColor}>{frames[frameIndex]}</Text>
      {text && <Text color={theme.colors.text_muted} dimColor>{text}</Text>}
    </Box>
  );
}

// Progress Bar
interface ProgressBarProps {
  value: number;
  max?: number;
  width?: number;
  showPercent?: boolean;
  color?: string;
  trackColor?: string;
}

export function ProgressBar({
  value,
  max = 100,
  width = 40,
  showPercent = true,
  color,
  trackColor,
}: ProgressBarProps) {
  const theme = useTheme();
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const barColor = color || theme.colors.primary;
  const bgColor = trackColor || theme.colors.border;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);

  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Text color={barColor}>{filledBar}</Text>
      <Text color={bgColor}>{emptyBar}</Text>
      {showPercent && <Text color={theme.colors.text_muted} dimColor>{Math.round(percent)}%</Text>}
    </Box>
  );
}

// Glitch effect text
interface GlitchTextProps {
  text: string;
  intensity?: 'low' | 'medium' | 'high';
  color?: string;
}

export function GlitchText({ text, intensity = 'medium', color }: GlitchTextProps) {
  const theme = useTheme();
  const glitchColor = color || theme.colors.primary;
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const intervals: NodeJS.Timeout[] = [];
    const baseInterval = intensity === 'low' ? 3000 : intensity === 'medium' ? 1500 : 500;

    const triggerGlitch = () => {
      setGlitch(true);
      const duration = intensity === 'low' ? 100 : intensity === 'medium' ? 200 : 400;
      setTimeout(() => setGlitch(false), duration);
    };

    intervals.push(setInterval(triggerGlitch, baseInterval + Math.random() * 1000));
    return () => intervals.forEach(clearInterval);
  }, [intensity]);

  return (
    <Text color={glitch ? theme.colors.error : glitchColor} bold={glitch}>
      {text}
    </Text>
  );
}

// Floating animation (placeholder - not really possible in terminal)
interface FloatProps {
  children: React.ReactNode;
}

export function Float({ children }: FloatProps) {
  return <Box>{children}</Box>;
}

// Simple fade in/out
interface FadeProps {
  children: React.ReactNode;
  visible: boolean;
}

export function Fade({ children, visible }: FadeProps) {
  if (!visible) return null;
  return <Box>{children}</Box>;
}