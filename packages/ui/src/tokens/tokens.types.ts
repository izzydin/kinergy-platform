/**
 * Design Tokens Contract & Taxonomy
 *
 * Single source of truth for design tokens used across `@kinergy-platform/ui`
 * and `@kinergy-platform/web`.
 */

export interface HslColor {
  h: number;
  s: number;
  l: number;
  a?: number;
}

export interface SemanticColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

export interface TypographyTokens {
  fontFamily: {
    sans: string;
    mono: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
  };
  fontWeight: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
    extrabold: number;
  };
}

export interface SpacingTokens {
  none: string;
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
}

export interface RadiusTokens {
  none: string;
  sm: string;
  md: string;
  lg: string;
  full: string;
}

export interface ShadowTokens {
  sm: string;
  md: string;
  lg: string;
  glass: string;
}

export interface ZIndexTokens {
  base: number;
  dropdown: number;
  sticky: number;
  drawer: number;
  modal: number;
  popover: number;
  toast: number;
  tooltip: number;
}

export interface DesignTokens {
  colors: SemanticColors;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
  zIndex: ZIndexTokens;
}
