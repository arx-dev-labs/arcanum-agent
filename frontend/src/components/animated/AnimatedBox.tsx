// Animated Box component with entrance/exit animations

import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../store';

interface AnimatedBoxProps {
  children: React.ReactNode;
  animation?: 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scale' | 'glitch';
  duration?: number;
  delay?: number;
  direction?: 'in' | 'out';
  style?: Record<string, unknown>;
}

export function AnimatedBox({
  children,
  animation = 'fade',
  duration = 300,
  delay = 0,
  direction = 'in',
  style = {},
}: AnimatedBoxProps) {
  const [visible, setVisible] = useState(direction === 'in');
  const { theme } = useTheme();

  useEffect(() => {
    if (direction === 'in') {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [direction, delay]);

  if (!visible && direction === 'out') {
    return null;
  }

  const animations: Record<string, string> = {
    fade: visible ? 'opacity: 1' : 'opacity: 0',
    slideUp: visible ? 'transform: translateY(0)' : 'transform: translateY(100%)',
    slideDown: visible ? 'transform: translateY(0)' : 'transform: translateY(-100%)',
    slideLeft: visible ? 'transform: translateX(0)' : 'transform: translateX(100%)',
    slideRight: visible ? 'transform: translateX(0)' : 'transform: translateX(-100%)',
    scale: visible ? 'transform: scale(1)' : 'transform: scale(0.95)',
    glitch: visible ? 'opacity: 1' : 'opacity: 0',
  };

  const animationStyle = animations[animation] || animations.fade;

  return (
    <Box
      style={{
        ...style,
        transition: `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        opacity: animation === 'fade' ? (visible ? 1 : 0) : 1,
      }}
    >
      {children}
    </Box>
  );
}

// Animated Text with typing effect
interface TypingTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  style?: Record<string, unknown>;
}

export function TypingText({ text, speed = 30, onComplete, style = {} }: TypingTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const { theme } = useTheme();

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

  return <Text style={{ ...style, color: theme.colors.text }}>{displayedText}</Text>;
}

// Gradient Text
interface GradientTextProps {
  children: React.ReactNode;
  colors?: string[];
  animation?: boolean;
  style?: Record<string, unknown>;
}

export function GradientText({ children, colors, animation = true, style = {} }: GradientTextProps) {
  const { theme } = useTheme();
  const gradientColors = colors || [theme.colors.primary, theme.colors.secondary, theme.colors.accent];

  return (
    <Text
      style={{
        ...style,
        background: `linear-gradient(90deg, ${gradientColors.join(', ')})`,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: animation ? 'gradient-shift 3s ease infinite' : undefined,
        backgroundSize: '200% 200%',
      }}
    >
      {children}
    </Text>
  );
}

// Pulsing/breathing animation
interface PulseProps {
  children: React.ReactNode;
  color?: string;
  speed?: number;
  style?: Record<string, unknown>;
}

export function Pulse({ children, color, speed = 1000, style = {} }: PulseProps) {
  const { theme } = useTheme();
  const pulseColor = color || theme.colors.primary;

  return (
    <Text
      style={{
        ...style,
        color: pulseColor,
        animation: `pulse ${speed}ms ease-in-out infinite`,
      }}
    >
      {children}
    </Text>
  );
}

// Spinner with custom frames
interface SpinnerProps {
  type?: 'dots' | 'line' | 'pipe' | 'bouncingBar' | 'bouncingBall' | 'earth' | 'moon' | 'clock' | 'hearts';
  color?: string;
  text?: string;
  style?: Record<string, unknown>;
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

export function Spinner({ type = 'dots', color, text, style = {} }: SpinnerProps) {
  const { theme } = useTheme();
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
    <Box style={{ ...style, flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      <Text style={{ color: spinnerColor }}>{frames[frameIndex]}</Text>
      {text && <Text style={{ color: theme.colors.text_muted }}>{text}</Text>}
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
  backgroundColor?: string;
  style?: Record<string, unknown>;
}

export function ProgressBar({
  value,
  max = 100,
  width = 40,
  showPercent = true,
  color,
  backgroundColor,
  style = {},
}: ProgressBarProps) {
  const { theme } = useTheme();
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const barColor = color || theme.colors.primary;
  const bgColor = backgroundColor || theme.colors.border;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);

  return (
    <Box style={{ ...style, flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      <Text style={{ color: barColor }}>{filledBar}</Text>
      <Text style={{ color: bgColor }}>{emptyBar}</Text>
      {showPercent && <Text style={{ color: theme.colors.text_muted, marginLeft: 1 }}>{Math.round(percent)}%</Text>}
    </Box>
  );
}

// Glitch effect text
interface GlitchTextProps {
  text: string;
  intensity?: 'low' | 'medium' | 'high';
  color?: string;
  style?: Record<string, unknown>;
}

export function GlitchText({ text, intensity = 'medium', color, style = {} }: GlitchTextProps) {
  const { theme } = useTheme();
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
    <Text
      style={{
        ...style,
        color: glitch ? theme.colors.error : glitchColor,
        textDecoration: glitch ? 'line-through' : 'none',
        transform: glitch ? 'skewX(-10deg)' : 'none',
      }}
    >
      {text}
    </Text>
  );
}

// Floating/levitating animation
interface FloatProps {
  children: React.ReactNode;
  amplitude?: number;
  speed?: number;
  style?: Record<string, unknown>;
}

export function Float({ children, amplitude = 1, speed = 2000, style = {} }: FloatProps) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      frame += 0.05;
      setOffset(Math.sin(frame) * amplitude);
      requestAnimationFrame(animate);
    };
    const id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [amplitude, speed]);

  return (
    <Box style={{ ...style, transform: `translateY(${offset}px)` }}>
      {children}
    </Box>
  );
}