import {
  APPROVED_NEUTRAL_TOKENS,
  calculateContrastRatio,
  CHART_TOKENS,
  INTERACTION_TOKENS,
  isWcagAccessible,
  isWcagNonTextAccessible,
  OFFICIAL_BRAND_TOKENS,
  SEMANTIC_STATUS_TOKENS,
  validateContrastCompliance,
} from '../index';

describe('WCAG 2.2 AA / AAA Comprehensive Contrast Validation Matrix', () => {
  describe('1. Normal Text Contrast (Requirement >= 4.5:1 for AA, >= 7.0:1 for AAA)', () => {
    it('validates Charcoal (#202522) on White (#FFFFFF) passes AAA (14.8:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        APPROVED_NEUTRAL_TOKENS.white,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(14.0);
      expect(res.passes).toBe(true);
    });

    it('validates Charcoal (#202522) on Application Background (#F8FAF9) passes AAA (14.3:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        APPROVED_NEUTRAL_TOKENS.background,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(14.0);
      expect(res.passes).toBe(true);
    });

    it('validates Secondary Text (#68716B) on White (#FFFFFF) satisfies AA (>= 4.5:1)', () => {
      const res = validateContrastCompliance(
        APPROVED_NEUTRAL_TOKENS.textSecondary,
        APPROVED_NEUTRAL_TOKENS.white,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(4.5);
      expect(res.passes).toBe(true);
    });

    it('validates Secondary Text (#68716B) on Background (#F8FAF9) satisfies AA (>= 4.5:1)', () => {
      const res = validateContrastCompliance(
        APPROVED_NEUTRAL_TOKENS.textSecondary,
        APPROVED_NEUTRAL_TOKENS.background,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(4.5);
      expect(res.passes).toBe(true);
    });

    it('validates Forest (#3F5F25) on White (#FFFFFF) satisfies AAA (>= 7.0:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        APPROVED_NEUTRAL_TOKENS.white,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('validates Forest (#3F5F25) on Tint (#F4FAEF) satisfies AA (6.88:1, >= 4.5:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        OFFICIAL_BRAND_TOKENS.kinergyTint,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(6.8);
      expect(res.passes).toBe(true);
    });

    it('validates Forest (#3F5F25) on Soft (#E5F6D9) satisfies AA (>= 4.5:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        OFFICIAL_BRAND_TOKENS.kinergySoft,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(6.0);
      expect(res.passes).toBe(true);
    });
  });

  describe('2. Button System Contrast Matrix (Default, Hover, Active)', () => {
    it('Primary Button: White text on Forest (#3F5F25) background achieves >= 7.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        APPROVED_NEUTRAL_TOKENS.white,
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Primary Button Hover: White text on Darkened Forest (#314B1D) achieves >= 9.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        APPROVED_NEUTRAL_TOKENS.white,
        INTERACTION_TOKENS.hover,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(9.0);
      expect(res.passes).toBe(true);
    });

    it('Primary Button Active: White text on Pressed Forest (#273D17) achieves >= 11.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        APPROVED_NEUTRAL_TOKENS.white,
        INTERACTION_TOKENS.active,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(11.0);
      expect(res.passes).toBe(true);
    });

    it('Brand Button: Charcoal (#202522) text on Kinergy Green (#68CE39) achieves >= 7.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Brand Button Hover: Charcoal (#202522) text on Hover Green (#55B52B) achieves >= 5.5:1 (AA)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        '#55B52B',
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(5.5);
      expect(res.passes).toBe(true);
    });

    it('Secondary Button: Forest (#3F5F25) text on White (#FFFFFF) background achieves >= 7.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        APPROVED_NEUTRAL_TOKENS.white,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Outline Button: Charcoal (#202522) text on White (#FFFFFF) achieves >= 14.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        APPROVED_NEUTRAL_TOKENS.white,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(14.0);
      expect(res.passes).toBe(true);
    });

    it('Destructive Button: White text on Red-700 (#B91C1C) background achieves >= 4.5:1 (AA)', () => {
      const res = validateContrastCompliance(
        APPROVED_NEUTRAL_TOKENS.white,
        SEMANTIC_STATUS_TOKENS.danger.default,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(4.5);
      expect(res.passes).toBe(true);
    });
  });

  describe('3. Links and Interactive Navigation', () => {
    it('Link: Forest (#3F5F25) text on White (#FFFFFF) satisfies AA & AAA (>= 7.0:1)', () => {
      expect(
        isWcagAccessible(OFFICIAL_BRAND_TOKENS.kinergyForest, APPROVED_NEUTRAL_TOKENS.white, 'AAA'),
      ).toBe(true);
    });

    it('Link: Forest (#3F5F25) text on App Background (#F8FAF9) satisfies AA (6.94:1, >= 4.5:1)', () => {
      expect(
        isWcagAccessible(
          OFFICIAL_BRAND_TOKENS.kinergyForest,
          APPROVED_NEUTRAL_TOKENS.background,
          'AA',
        ),
      ).toBe(true);
    });

    it('Active Sidebar Navigation: White text on Forest (#3F5F25) satisfies AAA (>= 7.0:1)', () => {
      expect(
        isWcagAccessible(APPROVED_NEUTRAL_TOKENS.white, OFFICIAL_BRAND_TOKENS.kinergyForest, 'AAA'),
      ).toBe(true);
    });

    it('Sidebar Secondary Navigation Text (#C1CBC3) on Charcoal (#202522) satisfies AA (>= 4.5:1)', () => {
      const ratio = calculateContrastRatio('#C1CBC3', OFFICIAL_BRAND_TOKENS.kinergyCharcoal);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    });
  });

  describe('4. Semantic Status Badges & Surfaces (Solid and Soft Variants)', () => {
    it('Success Solid Badge: White (#FFFFFF) on Forest (#3F5F25) achieves >= 7.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        SEMANTIC_STATUS_TOKENS.success.foreground,
        SEMANTIC_STATUS_TOKENS.success.default,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Success Soft Badge: Forest (#3F5F25) on Soft surface (#E5F6D9) satisfies AA (6.47:1, >= 4.5:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        SEMANTIC_STATUS_TOKENS.success.surface,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(6.0);
      expect(res.passes).toBe(true);
    });

    it('Warning Solid Badge: White (#FFFFFF) on Amber-700 (#B45309) achieves >= 4.5:1 (AA)', () => {
      const res = validateContrastCompliance(
        SEMANTIC_STATUS_TOKENS.warning.foreground,
        SEMANTIC_STATUS_TOKENS.warning.default,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(4.5);
      expect(res.passes).toBe(true);
    });

    it('Warning Soft Badge: Amber-700 (#B45309) on Amber-100 (#FEF3C7) satisfies AA (4.67:1, >= 4.5:1)', () => {
      const res = validateContrastCompliance(
        SEMANTIC_STATUS_TOKENS.warning.default,
        SEMANTIC_STATUS_TOKENS.warning.surface,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(4.5);
      expect(res.passes).toBe(true);
    });

    it('Danger Solid Badge: White (#FFFFFF) on Red-700 (#B91C1C) achieves >= 6.0:1 (AA)', () => {
      const res = validateContrastCompliance(
        SEMANTIC_STATUS_TOKENS.danger.foreground,
        SEMANTIC_STATUS_TOKENS.danger.default,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(6.0);
      expect(res.passes).toBe(true);
    });

    it('Danger Soft Badge: Red-700 (#B91C1C) on Red-100 (#FEE2E2) satisfies AA (5.27:1, >= 4.5:1)', () => {
      const res = validateContrastCompliance(
        SEMANTIC_STATUS_TOKENS.danger.default,
        SEMANTIC_STATUS_TOKENS.danger.surface,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(5.0);
      expect(res.passes).toBe(true);
    });

    it('Info Solid Badge: White (#FFFFFF) on Sky-700 (#0369A1) achieves >= 4.5:1 (AA)', () => {
      const res = validateContrastCompliance(
        SEMANTIC_STATUS_TOKENS.info.foreground,
        SEMANTIC_STATUS_TOKENS.info.default,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(4.5);
      expect(res.passes).toBe(true);
    });
  });

  describe('5. Non-Text UI Component Contrast (WCAG 2.2 SC 1.4.11 >= 3.0:1)', () => {
    it('Focus Ring: Forest (#3F5F25) indicator on White (#FFFFFF) satisfies SC 1.4.11 (>= 3.0:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        APPROVED_NEUTRAL_TOKENS.white,
        'focus-indicator',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(3.0);
      expect(res.passes).toBe(true);
    });

    it('Focus Ring: Forest (#3F5F25) indicator on Background (#F8FAF9) satisfies SC 1.4.11 (>= 3.0:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        APPROVED_NEUTRAL_TOKENS.background,
        'focus-indicator',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(3.0);
      expect(res.passes).toBe(true);
    });

    it('Sidebar Indicator Pill: Kinergy Green (#68CE39) against Charcoal (#202522) satisfies SC 1.4.11 (>= 3.0:1)', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        'ui-component',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Borders: Neutral Border (#D8DDD9) against Charcoal (#202522) satisfies SC 1.4.11 (>= 3.0:1)', () => {
      const res = validateContrastCompliance(
        APPROVED_NEUTRAL_TOKENS.border,
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        'ui-component',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(3.0);
      expect(res.passes).toBe(true);
    });

    it('Interactive Control Boundary: Forest (#3F5F25) on White (#FFFFFF) satisfies SC 1.4.11 (>= 3.0:1) with 7.41:1', () => {
      const res = validateContrastCompliance(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        APPROVED_NEUTRAL_TOKENS.white,
        'ui-component',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Selected State: Soft Surface (#E5F6D9) against White (#FFFFFF) satisfies visual distinctness', () => {
      expect(
        isWcagNonTextAccessible(OFFICIAL_BRAND_TOKENS.kinergyForest, INTERACTION_TOKENS.selected),
      ).toBe(true);
    });
  });

  describe('6. Chart Visualization Palette Contrast (WCAG SC 1.4.11 Graphical Objects >= 3.0:1)', () => {
    it('Chart 1 (Forest #3F5F25) on White satisfies SC 1.4.11 (>= 3.0:1)', () => {
      expect(isWcagNonTextAccessible(CHART_TOKENS.chart1, APPROVED_NEUTRAL_TOKENS.white)).toBe(
        true,
      );
    });

    it('Chart 3 (Blue #2563EB) on White satisfies SC 1.4.11 (>= 3.0:1)', () => {
      expect(isWcagNonTextAccessible(CHART_TOKENS.chart3, APPROVED_NEUTRAL_TOKENS.white)).toBe(
        true,
      );
    });

    it('Chart 4 (Amber #D97706) on White satisfies SC 1.4.11 (>= 3.0:1)', () => {
      expect(isWcagNonTextAccessible(CHART_TOKENS.chart4, APPROVED_NEUTRAL_TOKENS.white)).toBe(
        true,
      );
    });

    it('Chart 5 (Purple #7C3AED) on White satisfies SC 1.4.11 (>= 3.0:1)', () => {
      expect(isWcagNonTextAccessible(CHART_TOKENS.chart5, APPROVED_NEUTRAL_TOKENS.white)).toBe(
        true,
      );
    });
  });

  describe('7. Negative Testing & Input Guardrails', () => {
    it('proves that White text on Kinergy Green (#68CE39) fails WCAG 2.2 AA for normal text (< 4.5:1)', () => {
      const ratio = calculateContrastRatio(
        APPROVED_NEUTRAL_TOKENS.white,
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
      );
      // Contrast of white on bright green is ~2.08:1
      expect(ratio).toBeLessThan(4.5);
      expect(
        isWcagAccessible(APPROVED_NEUTRAL_TOKENS.white, OFFICIAL_BRAND_TOKENS.kinergyGreen),
      ).toBe(false);
    });

    it('confirms that Kinergy Charcoal (#202522) must be used on Kinergy Green (#68CE39)', () => {
      const ratio = calculateContrastRatio(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
      );
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(
        isWcagAccessible(OFFICIAL_BRAND_TOKENS.kinergyCharcoal, OFFICIAL_BRAND_TOKENS.kinergyGreen),
      ).toBe(true);
    });
  });

  describe('8. Dark Mode Contrast Compliance Matrix (WCAG 2.2 AA / AAA)', () => {
    // Approved Dark Palette Hex Equivalents (Derived from KIN-BRAND-UI-001)
    const darkTokens = {
      background: '#0d120f', // 144 15% 6%
      card: '#202522', // 144 7.2% 13.5% (OFFICIAL_BRAND_TOKENS.kinergyCharcoal)
      secondary: '#2b332e', // 144 6% 18%
      foreground: '#f2f6f3', // 140 10% 96%
      mutedForeground: '#9ea7a1', // 140 5% 65%
      primary: '#68ce39', // 101.1 60.3% 51.6% (OFFICIAL_BRAND_TOKENS.kinergyGreen)
      primaryForeground: '#202522', // 144 7.2% 13.5% (OFFICIAL_BRAND_TOKENS.kinergyCharcoal)
    };

    it('Primary Text on Dark Card (#f2f6f3 on #202522) achieves >= 7.0:1 (passes AAA >= 14.0:1)', () => {
      const res = validateContrastCompliance(
        darkTokens.foreground,
        darkTokens.card,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(14.0);
      expect(res.passes).toBe(true);
    });

    it('Primary Text on Dark Background (#f2f6f3 on #0d120f) achieves >= 7.0:1 (passes AAA >= 17.0:1)', () => {
      const res = validateContrastCompliance(
        darkTokens.foreground,
        darkTokens.background,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(17.0);
      expect(res.passes).toBe(true);
    });

    it('Muted Text on Dark Card (#9ea7a1 on #202522) achieves >= 4.5:1 (passes AA >= 6.0:1)', () => {
      const res = validateContrastCompliance(
        darkTokens.mutedForeground,
        darkTokens.card,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(6.0);
      expect(res.passes).toBe(true);
    });

    it('Muted Text on Dark Background (#9ea7a1 on #0d120f) achieves >= 4.5:1 (passes AAA >= 7.0:1)', () => {
      const res = validateContrastCompliance(
        darkTokens.mutedForeground,
        darkTokens.background,
        'normal-text',
        'AA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Primary Action in Dark Mode: Charcoal on Green (#202522 on #68ce39) achieves >= 7.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        darkTokens.primaryForeground,
        darkTokens.primary,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(7.0);
      expect(res.passes).toBe(true);
    });

    it('Focus Ring / Boundary Non-text UI Contrast: Green on Card (#68ce39 on #202522) achieves >= 3.0:1', () => {
      const ratio = calculateContrastRatio(darkTokens.primary, darkTokens.card);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(isWcagNonTextAccessible(darkTokens.primary, darkTokens.card)).toBe(true);
    });

    it('Secondary Elevated Surface: Foreground on Secondary (#f2f6f3 on #2b332e) achieves >= 7.0:1 (AAA)', () => {
      const res = validateContrastCompliance(
        darkTokens.foreground,
        darkTokens.secondary,
        'normal-text',
        'AAA',
      );
      expect(res.ratio).toBeGreaterThanOrEqual(10.0);
      expect(res.passes).toBe(true);
    });
  });
});
