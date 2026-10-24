// Theme system for Arcanum TUI

import type { Theme } from '../types';

export const themes: Record<string, Theme> = {
  // Cyberpunk / Synthwave theme
  cyberpunk: {
    name: 'Cyberpunk',
    colors: {
      primary: '#00ffff',
      secondary: '#ff00ff',
      accent: '#ffff00',
      background: '#0a0a12',
      surface: '#12121f',
      text: '#e0e0ff',
      text_muted: '#6a6a8a',
      border: '#00ffff44',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff3366',
      info: '#00ccff',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #00ffff 0%, #ff00ff 100%)',
      secondary: 'linear-gradient(135deg, #12121f 0%, #1a1a2e 100%)',
      accent: 'linear-gradient(90deg, #ff00ff 0%, #ffff00 100%)',
    },
  },

  // Ocean / Deep blue theme
  ocean: {
    name: 'Ocean',
    colors: {
      primary: '#00d4ff',
      secondary: '#00ff88',
      accent: '#ffd700',
      background: '#001122',
      surface: '#001a33',
      text: '#cceeff',
      text_muted: '#6699aa',
      border: '#00d4ff44',
      success: '#00ff88',
      warning: '#ffaa00',
      error: '#ff4466',
      info: '#00d4ff',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #001122 0%, #002244 100%)',
      secondary: 'linear-gradient(135deg, #002244 0%, #003366 100%)',
      accent: 'linear-gradient(90deg, #00d4ff 0%, #00ff88 100%)',
    },
  },

  // Forest / Nature theme
  forest: {
    name: 'Forest',
    colors: {
      primary: '#4ade80',
      secondary: '#22c55e',
      accent: '#facc15',
      background: '#052e16',
      surface: '#0a3d1e',
      text: '#dcfce7',
      text_muted: '#86efac',
      border: '#4ade8044',
      success: '#4ade80',
      warning: '#facc15',
      error: '#ef4444',
      info: '#60a5fa',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #052e16 0%, #0a3d1e 100%)',
      secondary: 'linear-gradient(135deg, #0a3d1e 0%, #14532d 100%)',
      accent: 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)',
    },
  },

  // Monochrome / Minimal theme
  mono: {
    name: 'Monochrome',
    colors: {
      primary: '#ffffff',
      secondary: '#cccccc',
      accent: '#888888',
      background: '#000000',
      surface: '#111111',
      text: '#ffffff',
      text_muted: '#888888',
      border: '#333333',
      success: '#cccccc',
      warning: '#aaaaaa',
      error: '#ffffff',
      info: '#cccccc',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #000000 0%, #111111 100%)',
      secondary: 'linear-gradient(135deg, #111111 0%, #222222 100%)',
      accent: 'linear-gradient(90deg, #888888 0%, #cccccc 100%)',
    },
  },

  // Sunset / Warm theme
  sunset: {
    name: 'Sunset',
    colors: {
      primary: '#ff6b35',
      secondary: '#f7931e',
      accent: '#ffd23f',
      background: '#1a0a0a',
      surface: '#2d1010',
      text: '#ffe4d6',
      text_muted: '#cc9988',
      border: '#ff6b3544',
      success: '#4ade80',
      warning: '#facc15',
      error: '#f87171',
      info: '#fbbf24',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #1a0a0a 0%, #2d1010 100%)',
      secondary: 'linear-gradient(135deg, #2d1010 0%, #3d1515 100%)',
      accent: 'linear-gradient(90deg, #ff6b35 0%, #ffd23f 100%)',
    },
  },

  // Matrix / Hacker theme
  matrix: {
    name: 'Matrix',
    colors: {
      primary: '#00ff00',
      secondary: '#00cc00',
      accent: '#009900',
      background: '#000000',
      surface: '#001100',
      text: '#00ff00',
      text_muted: '#008800',
      border: '#003300',
      success: '#00ff00',
      warning: '#ffff00',
      error: '#ff0000',
      info: '#00ffff',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #000000 0%, #001100 100%)',
      secondary: 'linear-gradient(135deg, #001100 0%, #002200 100%)',
      accent: 'linear-gradient(90deg, #00cc00 0%, #00ff00 100%)',
    },
  },

  // Dracula theme (popular)
  dracula: {
    name: 'Dracula',
    colors: {
      primary: '#bd93f9',
      secondary: '#ff79c6',
      accent: '#f1fa8c',
      background: '#282a36',
      surface: '#44475a',
      text: '#f8f8f2',
      text_muted: '#6272a4',
      border: '#6272a4',
      success: '#50fa7b',
      warning: '#f1fa8c',
      error: '#ff5555',
      info: '#8be9fd',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #282a36 0%, #44475a 100%)',
      secondary: 'linear-gradient(135deg, #44475a 0%, #6272a4 100%)',
      accent: 'linear-gradient(90deg, #bd93f9 0%, #ff79c6 100%)',
    },
  },

  // Nord theme
  nord: {
    name: 'Nord',
    colors: {
      primary: '#88c0d0',
      secondary: '#81a1c1',
      accent: '#ebcb8b',
      background: '#2e3440',
      surface: '#3b4252',
      text: '#eceff4',
      text_muted: '#4c566a',
      border: '#4c566a',
      success: '#a3be8c',
      warning: '#ebcb8b',
      error: '#bf616a',
      info: '#88c0d0',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #2e3440 0%, #3b4252 100%)',
      secondary: 'linear-gradient(135deg, #3b4252 0%, #434c5e 100%)',
      accent: 'linear-gradient(90deg, #81a1c1 0%, #88c0d0 100%)',
    },
  },
};

export type ThemeName = keyof typeof themes;

export type { Theme };

export const defaultTheme: ThemeName = 'cyberpunk';

export function getTheme(name: ThemeName = defaultTheme): Theme {
  return themes[name] || themes[defaultTheme];
}

export function listThemes(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}

// ANSI color helpers
export function hexToAnsi256(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  if (r === g && g === b) {
    // Grayscale
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }

  // Color cube
  const ri = Math.round((r / 255) * 5);
  const gi = Math.round((g / 255) * 5);
  const bi = Math.round((b / 255) * 5);
  return 16 + (ri * 36) + (gi * 6) + bi;
}

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export function rgbToAnsi(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function bgRgbToAnsi(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

export function resetAnsi(): string {
  return '\x1b[0m';
}

// Gradient text helper (for Ink)
export function gradientText(text: string, colors: string[]): string {
  // This creates a gradient by interpolating between colors
  // For actual rendering, use ink-gradient component
  return text;
}