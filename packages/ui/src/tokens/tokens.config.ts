import type { DesignTokens, SemanticColors } from './tokens.types';

/**
 * Light Theme HSL Semantic Design Tokens
 */
export const LIGHT_SEMANTIC_COLORS: SemanticColors = {
  background: '0 0% 100%',
  foreground: '222.2 84% 4.9%',
  card: '0 0% 100%',
  cardForeground: '222.2 84% 4.9%',
  popover: '0 0% 100%',
  popoverForeground: '222.2 84% 4.9%',
  primary: '221.2 83.2% 53.3%',
  primaryForeground: '210 40% 98%',
  secondary: '210 40% 96.1%',
  secondaryForeground: '222.2 47.4% 11.2%',
  muted: '210 40% 96.1%',
  mutedForeground: '215.4 16.3% 46.9%',
  accent: '210 40% 96.1%',
  accentForeground: '222.2 47.4% 11.2%',
  destructive: '0 84.2% 60.2%',
  destructiveForeground: '210 40% 98%',
  border: '214.3 31.8% 91.4%',
  input: '214.3 31.8% 91.4%',
  ring: '221.2 83.2% 53.3%',
};

/**
 * Dark Theme HSL Semantic Design Tokens (Default Platform Aesthetic)
 */
export const DARK_SEMANTIC_COLORS: SemanticColors = {
  background: '224 71% 4%',
  foreground: '213 31% 91%',
  card: '224 71% 7%',
  cardForeground: '213 31% 91%',
  popover: '224 71% 7%',
  popoverForeground: '213 31% 91%',
  primary: '210 100% 50%',
  primaryForeground: '0 0% 100%',
  secondary: '215 27.9% 16.9%',
  secondaryForeground: '210 20% 98%',
  muted: '215 27.9% 16.9%',
  mutedForeground: '217.9 10.6% 64.9%',
  accent: '215 27.9% 16.9%',
  accentForeground: '210 20% 98%',
  destructive: '0 62.8% 30.6%',
  destructiveForeground: '210 20% 98%',
  border: '215 27.9% 16.9%',
  input: '215 27.9% 16.9%',
  ring: '216 100% 50%',
};

/**
 * Shared Design System Token Definitions
 */
export const DESIGN_TOKENS: DesignTokens = {
  colors: DARK_SEMANTIC_COLORS,
  typography: {
    fontFamily: {
      sans: 'Inter, system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
  },
  spacing: {
    none: '0px',
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
  },
  radius: {
    none: '0px',
    sm: 'calc(var(--radius) - 4px)',
    md: 'calc(var(--radius) - 2px)',
    lg: 'var(--radius)',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
  },
  zIndex: {
    base: 0,
    dropdown: 10,
    sticky: 20,
    drawer: 40,
    modal: 50,
    popover: 60,
    toast: 70,
    tooltip: 80,
  },
};
