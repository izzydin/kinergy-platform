/**
 * WCAG 2.2 Relative Luminance and Contrast Calculation Engine
 *
 * Implements the official W3C WCAG 2.2 relative luminance algorithm and contrast ratio formula:
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 * https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

export type WcagLevel = 'AA' | 'AAA';
export type WcagTextSize = 'normal' | 'large';
export type WcagTargetType =
  'normal-text' | 'large-text' | 'ui-component' | 'focus-indicator' | 'chart';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ContrastValidationResult {
  foreground: string;
  background: string;
  targetType: WcagTargetType;
  level: WcagLevel;
  ratio: number;
  requiredRatio: number;
  passes: boolean;
  details: string;
}

/**
 * Normalizes and validates a HEX color string.
 * Supports:
 * - 6-digit HEX: `#RRGGBB` or `RRGGBB`
 * - 3-digit HEX: `#RGB` or `RGB`
 *
 * Throws an Error on invalid HEX format.
 */
export function normalizeHexColor(hex: string): string {
  if (typeof hex !== 'string') {
    throw new Error(`Color must be a string, received: ${typeof hex}`);
  }

  let clean = hex.trim();
  if (clean.startsWith('#')) {
    clean = clean.slice(1);
  }

  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((char) => char + char)
      .join('');
  }

  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(
      `Invalid HEX color format: "${hex}". Expected standard 3-character or 6-character hexadecimal string (e.g. #FFF or #68CE39).`,
    );
  }

  return clean.toLowerCase();
}

/**
 * Parses a valid HEX color string into 8-bit RGB components (0-255).
 */
export function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/**
 * Converts an 8-bit sRGB channel component (0-255) to linear light value.
 */
export function sRgbChannelToLinear(channel: number): number {
  if (channel < 0 || channel > 255 || isNaN(channel)) {
    throw new Error(`RGB channel value must be between 0 and 255, received: ${channel}`);
  }
  const norm = channel / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

/**
 * Calculates the relative luminance of a HEX color per WCAG 2.2 specifications.
 * Relative luminance is normalized to 0 for darkest black and 1 for lightest white.
 */
export function calculateRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const rLinear = sRgbChannelToLinear(r);
  const gLinear = sRgbChannelToLinear(g);
  const bLinear = sRgbChannelToLinear(b);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculates the WCAG contrast ratio between two HEX colors.
 * The ratio is defined as (L1 + 0.05) / (L2 + 0.05), where L1 is the relative luminance
 * of the lighter color, and L2 is the relative luminance of the darker color.
 *
 * Result is rounded to 2 decimal places.
 */
export function calculateContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const lum1 = calculateRelativeLuminance(foregroundHex);
  const lum2 = calculateRelativeLuminance(backgroundHex);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Determines whether two colors satisfy WCAG 2.2 contrast compliance for text.
 *
 * - AA Normal text: ratio >= 4.5
 * - AA Large text (>= 18pt / 24px or >= 14pt / 18.66px bold): ratio >= 3.0
 * - AAA Normal text: ratio >= 7.0
 * - AAA Large text: ratio >= 4.5
 */
export function isWcagAccessible(
  foregroundHex: string,
  backgroundHex: string,
  level: WcagLevel = 'AA',
  textSize: WcagTextSize = 'normal',
): boolean {
  const ratio = calculateContrastRatio(foregroundHex, backgroundHex);

  if (level === 'AAA') {
    return textSize === 'large' ? ratio >= 4.5 : ratio >= 7.0;
  }

  // Level AA
  return textSize === 'large' ? ratio >= 3.0 : ratio >= 4.5;
}

/**
 * Determines whether two colors satisfy WCAG 2.2 SC 1.4.11 Non-text Contrast (>= 3.0:1).
 * Applies to:
 * - User Interface Components (buttons, inputs, borders, tabs, icons)
 * - Focus indicators
 * - Graphical objects (data points in charts, icons essential for comprehension)
 */
export function isWcagNonTextAccessible(foregroundHex: string, backgroundHex: string): boolean {
  const ratio = calculateContrastRatio(foregroundHex, backgroundHex);
  return ratio >= 3.0;
}

/**
 * Performs a comprehensive WCAG 2.2 contrast evaluation across target categories.
 */
export function validateContrastCompliance(
  foregroundHex: string,
  backgroundHex: string,
  targetType: WcagTargetType = 'normal-text',
  level: WcagLevel = 'AA',
): ContrastValidationResult {
  const ratio = calculateContrastRatio(foregroundHex, backgroundHex);

  let requiredRatio: number;
  if (targetType === 'normal-text') {
    requiredRatio = level === 'AAA' ? 7.0 : 4.5;
  } else if (targetType === 'large-text') {
    requiredRatio = level === 'AAA' ? 4.5 : 3.0;
  } else {
    // ui-component, focus-indicator, chart (SC 1.4.11)
    requiredRatio = 3.0;
  }

  const passes = ratio >= requiredRatio;
  const details = passes
    ? `Contrast ratio of ${ratio}:1 satisfies WCAG 2.2 ${level} requirement (>= ${requiredRatio}:1) for ${targetType}.`
    : `Contrast ratio of ${ratio}:1 fails WCAG 2.2 ${level} requirement (>= ${requiredRatio}:1) for ${targetType}.`;

  return {
    foreground: foregroundHex,
    background: backgroundHex,
    targetType,
    level,
    ratio,
    requiredRatio,
    passes,
    details,
  };
}
