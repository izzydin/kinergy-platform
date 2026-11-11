import type {
  ApprovedNeutralTokens,
  ChartTokens,
  DesignTokens,
  InteractionStateTokens,
  OfficialBrandTokens,
  SemanticColors,
  SemanticStatusTokens,
} from './tokens.types';

/**
 * =============================================================================
 * Official Kinergy Brand Tokens (Canonical HEX values per KIN-BRAND-UI-001)
 * =============================================================================
 * These exact values must be preserved without modification.
 */
export const OFFICIAL_BRAND_TOKENS: OfficialBrandTokens = {
  kinergyGreen: '#68CE39',
  kinergyForest: '#3F5F25',
  kinergyCharcoal: '#202522',
  kinergySoft: '#E5F6D9',
  kinergyTint: '#F4FAEF',
};

/**
 * =============================================================================
 * Approved Neutral Tokens (Canonical HEX values per KIN-BRAND-UI-001)
 * =============================================================================
 * These exact values must be preserved without modification.
 */
export const APPROVED_NEUTRAL_TOKENS: ApprovedNeutralTokens = {
  white: '#FFFFFF',
  background: '#F8FAF9',
  border: '#D8DDD9',
  textSecondary: '#68716B',
};

/**
 * =============================================================================
 * Semantic Status Tokens
 * =============================================================================
 * Standardized status feedback scales for Success, Warning, Danger, and Info.
 * All surface/foreground pairings meet or exceed WCAG 2.2 AA (>= 4.5:1).
 */
export const SEMANTIC_STATUS_TOKENS: SemanticStatusTokens = {
  success: {
    default: '#3F5F25', // Forest
    foreground: '#FFFFFF', // White -> Contrast 7.30:1
    surface: '#E5F6D9', // Soft
    border: '#68CE39', // Green
  },
  warning: {
    default: '#B45309', // Amber-700
    foreground: '#FFFFFF', // White -> Contrast 5.21:1
    surface: '#FEF3C7', // Amber-100
    border: '#FCD34D', // Amber-300
  },
  danger: {
    default: '#B91C1C', // Red-700
    foreground: '#FFFFFF', // White -> Contrast 6.47:1
    surface: '#FEE2E2', // Red-100
    border: '#FCA5A5', // Red-300
  },
  info: {
    default: '#0369A1', // Sky-700
    foreground: '#FFFFFF', // White -> Contrast 4.67:1
    surface: '#E0F2FE', // Sky-100
    border: '#7DD3FC', // Sky-300
  },
};

/**
 * =============================================================================
 * Data Visualization & Chart Tokens
 * =============================================================================
 */
export const CHART_TOKENS: ChartTokens = {
  chart1: '#3F5F25', // Forest
  chart2: '#68CE39', // Green
  chart3: '#2563EB', // Blue-600
  chart4: '#D97706', // Amber-600
  chart5: '#7C3AED', // Purple-600
};

/**
 * =============================================================================
 * Interactive State Tokens
 * =============================================================================
 */
export const INTERACTION_TOKENS: InteractionStateTokens = {
  default: '#3F5F25',
  hover: '#314B1D',
  active: '#273D17',
  focusVisible: '#3F5F25',
  selected: '#E5F6D9',
  disabled: 'rgba(63, 95, 37, 0.4)',
  invalid: '#B91C1C',
  success: '#3F5F25',
};

/**
 * =============================================================================
 * Light Theme HSL Semantic Design Tokens (Official Platform Aesthetic v1.0)
 * =============================================================================
 * Maps canonical Kinergy brand and neutral values into shadcn/ui and Tailwind
 * HSL variable format (`H S% L%` without `hsl()` wrapper).
 */
export const LIGHT_SEMANTIC_COLORS: SemanticColors = {
  // Neutral surfaces
  background: '150 16.7% 97.6%', // #F8FAF9 (--color-background)
  foreground: '144 7.2% 13.5%', // #202522 (--kinergy-charcoal)
  card: '0 0% 100%', // #FFFFFF (--color-white)
  cardForeground: '144 7.2% 13.5%', // #202522 (--kinergy-charcoal)
  popover: '0 0% 100%', // #FFFFFF (--color-white)
  popoverForeground: '144 7.2% 13.5%', // #202522 (--kinergy-charcoal)

  // Primary Action (Forest bg + White fg -> 7.30:1 contrast)
  primary: '93.1 43.9% 25.9%', // #3F5F25 (--kinergy-forest)
  primaryForeground: '0 0% 100%', // #FFFFFF (--color-white)

  // Secondary Action (Soft surface + Forest fg -> 6.44:1 contrast)
  secondary: '95.2 61.7% 90.8%', // #E5F6D9 (--kinergy-soft)
  secondaryForeground: '93.1 43.9% 25.9%', // #3F5F25 (--kinergy-forest)

  // Muted & Accent (Tint surface + Text Secondary -> 4.81:1 contrast)
  muted: '92.7 52.4% 95.9%', // #F4FAEF (--kinergy-tint)
  mutedForeground: '140 4.1% 42.5%', // #68716B (--color-text-secondary)
  accent: '92.7 52.4% 95.9%', // #F4FAEF (--kinergy-tint)
  accentForeground: '144 7.2% 13.5%', // #202522 (--kinergy-charcoal)

  // Destructive Action (Red-600 bg + White fg -> 4.83:1 contrast)
  destructive: '0 72% 51%', // #DC2626
  destructiveForeground: '0 0% 100%', // #FFFFFF

  // Structural boundaries & Focus rings
  border: '132 6.8% 85.7%', // #D8DDD9 (--color-border)
  input: '132 6.8% 85.7%', // #D8DDD9 (--color-border)
  ring: '93.1 43.9% 25.9%', // #3F5F25 (--kinergy-forest)

  // Brand Action (Green bg + Charcoal fg -> 7.77:1 contrast)
  brand: '101.1 60.3% 51.6%', // #68CE39 (--kinergy-green)
  brandForeground: '144 7.2% 13.5%', // #202522 (--kinergy-charcoal)
};

/**
 * =============================================================================
 * Dark Theme HSL Semantic Design Tokens (Architecture Prepared for Future)
 * =============================================================================
 * Prepared clean architecture without unapproved auto-inversion.
 */
export const DARK_SEMANTIC_COLORS: SemanticColors = {
  background: '224 71% 4%',
  foreground: '213 31% 91%',
  card: '224 71% 7%',
  cardForeground: '213 31% 91%',
  popover: '224 71% 7%',
  popoverForeground: '213 31% 91%',
  primary: '101.1 60.3% 51.6%', // Kinergy Green
  primaryForeground: '144 7.2% 13.5%', // Charcoal foreground
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
  ring: '101.1 60.3% 51.6%',
  brand: '101.1 60.3% 51.6%',
  brandForeground: '144 7.2% 13.5%',
};

/**
 * =============================================================================
 * Shared Design System Token Definitions (Root Single Source of Truth)
 * =============================================================================
 */
export const DESIGN_TOKENS: DesignTokens = {
  brand: OFFICIAL_BRAND_TOKENS,
  neutrals: APPROVED_NEUTRAL_TOKENS,
  status: SEMANTIC_STATUS_TOKENS,
  charts: CHART_TOKENS,
  interaction: INTERACTION_TOKENS,
  colors: LIGHT_SEMANTIC_COLORS, // Light theme is official v1.0
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
