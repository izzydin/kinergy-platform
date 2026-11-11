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

/**
 * Official Kinergy Brand Tokens (Canonical HEX values per KIN-BRAND-UI-001)
 */
export interface OfficialBrandTokens {
  readonly kinergyGreen: '#68CE39';
  readonly kinergyForest: '#3F5F25';
  readonly kinergyCharcoal: '#202522';
  readonly kinergySoft: '#E5F6D9';
  readonly kinergyTint: '#F4FAEF';
}

/**
 * Approved Neutral Tokens (Canonical HEX values per KIN-BRAND-UI-001)
 */
export interface ApprovedNeutralTokens {
  readonly white: '#FFFFFF';
  readonly background: '#F8FAF9';
  readonly border: '#D8DDD9';
  readonly textSecondary: '#68716B';
}

/**
 * Semantic Status Scale Contract
 */
export interface SemanticStatusScale {
  readonly default: string;
  readonly foreground: string;
  readonly surface: string;
  readonly border: string;
}

/**
 * Complete Semantic Status Tokens
 */
export interface SemanticStatusTokens {
  readonly success: SemanticStatusScale;
  readonly warning: SemanticStatusScale;
  readonly danger: SemanticStatusScale;
  readonly info: SemanticStatusScale;
}

/**
 * Data Visualization & Chart Tokens
 */
export interface ChartTokens {
  readonly chart1: string;
  readonly chart2: string;
  readonly chart3: string;
  readonly chart4: string;
  readonly chart5: string;
}

/**
 * Interactive States Tokens Contract
 */
export interface InteractionStateTokens {
  readonly default: string;
  readonly hover: string;
  readonly active: string;
  readonly focusVisible: string;
  readonly selected: string;
  readonly disabled: string;
  readonly invalid: string;
  readonly success: string;
}

/**
 * shadcn/ui & Tailwind Semantic HSL Color Channel Maps
 */
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
  brand?: string;
  brandForeground?: string;
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
  brand: OfficialBrandTokens;
  neutrals: ApprovedNeutralTokens;
  status: SemanticStatusTokens;
  charts: ChartTokens;
  interaction: InteractionStateTokens;
  colors: SemanticColors;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
  zIndex: ZIndexTokens;
}
