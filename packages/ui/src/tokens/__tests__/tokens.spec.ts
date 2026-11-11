import fs from 'fs';
import path from 'path';
import {
  APPROVED_NEUTRAL_TOKENS,
  calculateContrastRatio,
  calculateRelativeLuminance,
  CHART_TOKENS,
  DESIGN_TOKENS,
  hexToRgb,
  INTERACTION_TOKENS,
  isWcagAccessible,
  LIGHT_SEMANTIC_COLORS,
  normalizeHexColor,
  OFFICIAL_BRAND_TOKENS,
  SEMANTIC_STATUS_TOKENS,
} from '../index';

describe('Kinergy Design System Token Engine & Contract Verification', () => {
  describe('1. Official Brand & Approved Neutral Tokens (Exact Values)', () => {
    it('preserves exact official brand HEX values per KIN-BRAND-UI-001', () => {
      expect(OFFICIAL_BRAND_TOKENS.kinergyGreen).toBe('#68CE39');
      expect(OFFICIAL_BRAND_TOKENS.kinergyForest).toBe('#3F5F25');
      expect(OFFICIAL_BRAND_TOKENS.kinergyCharcoal).toBe('#202522');
      expect(OFFICIAL_BRAND_TOKENS.kinergySoft).toBe('#E5F6D9');
      expect(OFFICIAL_BRAND_TOKENS.kinergyTint).toBe('#F4FAEF');
    });

    it('preserves exact approved neutral HEX values per KIN-BRAND-UI-001', () => {
      expect(APPROVED_NEUTRAL_TOKENS.white).toBe('#FFFFFF');
      expect(APPROVED_NEUTRAL_TOKENS.background).toBe('#F8FAF9');
      expect(APPROVED_NEUTRAL_TOKENS.border).toBe('#D8DDD9');
      expect(APPROVED_NEUTRAL_TOKENS.textSecondary).toBe('#68716B');
    });
  });

  describe('2. Semantic Status & Chart Tokens Presence', () => {
    it('defines complete semantic status scales for success, warning, danger, and info', () => {
      const statuses = ['success', 'warning', 'danger', 'info'] as const;
      for (const status of statuses) {
        expect(SEMANTIC_STATUS_TOKENS[status]).toBeDefined();
        expect(SEMANTIC_STATUS_TOKENS[status].default).toBeDefined();
        expect(SEMANTIC_STATUS_TOKENS[status].foreground).toBeDefined();
        expect(SEMANTIC_STATUS_TOKENS[status].surface).toBeDefined();
        expect(SEMANTIC_STATUS_TOKENS[status].border).toBeDefined();
      }
    });

    it('defines complete chart visualization tokens', () => {
      expect(CHART_TOKENS.chart1).toBe('#3F5F25');
      expect(CHART_TOKENS.chart2).toBe('#68CE39');
      expect(CHART_TOKENS.chart3).toBe('#2563EB');
      expect(CHART_TOKENS.chart4).toBe('#D97706');
      expect(CHART_TOKENS.chart5).toBe('#7C3AED');
    });

    it('defines complete interaction state tokens', () => {
      expect(INTERACTION_TOKENS.default).toBe('#3F5F25');
      expect(INTERACTION_TOKENS.hover).toBe('#314B1D');
      expect(INTERACTION_TOKENS.active).toBe('#273D17');
      expect(INTERACTION_TOKENS.focusVisible).toBe('#3F5F25');
      expect(INTERACTION_TOKENS.selected).toBe('#E5F6D9');
      expect(INTERACTION_TOKENS.disabled).toBeDefined();
      expect(INTERACTION_TOKENS.invalid).toBe('#B91C1C');
      expect(INTERACTION_TOKENS.success).toBe('#3F5F25');
    });
  });

  describe('3. WCAG Relative Luminance & Contrast Calculation Utility', () => {
    it('normalizes valid 6-digit and 3-digit HEX colors correctly', () => {
      expect(normalizeHexColor('#FFFFFF')).toBe('ffffff');
      expect(normalizeHexColor('#fff')).toBe('ffffff');
      expect(normalizeHexColor('68ce39')).toBe('68ce39');
      expect(normalizeHexColor('#68CE39')).toBe('68ce39');
      expect(normalizeHexColor('abc')).toBe('aabbcc');
    });

    it('rejects invalid or malformed HEX color inputs with descriptive error', () => {
      expect(() => normalizeHexColor('#12')).toThrow(/Invalid HEX color format/i);
      expect(() => normalizeHexColor('#12345')).toThrow(/Invalid HEX color format/i);
      expect(() => normalizeHexColor('#GGGGGG')).toThrow(/Invalid HEX color format/i);
      expect(() => normalizeHexColor('not-a-color')).toThrow(/Invalid HEX color format/i);
      expect(() => normalizeHexColor(null as unknown as string)).toThrow(/Color must be a string/i);
    });

    it('parses HEX to RGB components correctly', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#68CE39')).toEqual({ r: 104, g: 206, b: 57 });
    });

    it('calculates relative luminance accurately according to W3C formula', () => {
      expect(calculateRelativeLuminance('#000000')).toBe(0);
      expect(calculateRelativeLuminance('#FFFFFF')).toBe(1);
      // Intermediate luminance of brand green #68CE39 is approx 0.47
      const greenLuminance = calculateRelativeLuminance('#68CE39');
      expect(greenLuminance).toBeGreaterThan(0.4);
      expect(greenLuminance).toBeLessThan(0.6);
    });

    it('calculates canonical extreme contrast ratios correctly', () => {
      expect(calculateContrastRatio('#000000', '#FFFFFF')).toBe(21);
      expect(calculateContrastRatio('#FFFFFF', '#000000')).toBe(21);
      expect(calculateContrastRatio('#68CE39', '#68CE39')).toBe(1);
    });
  });

  describe('4. Mandatory Action & Semantic Contrast Compliance (WCAG 2.2 AA)', () => {
    it('validates Primary Action: White (#FFFFFF) on Forest (#3F5F25) achieves >= 4.5:1 (passes AAA >= 7.0:1)', () => {
      const ratio = calculateContrastRatio(
        APPROVED_NEUTRAL_TOKENS.white,
        OFFICIAL_BRAND_TOKENS.kinergyForest,
      );
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(
        isWcagAccessible(APPROVED_NEUTRAL_TOKENS.white, OFFICIAL_BRAND_TOKENS.kinergyForest, 'AAA'),
      ).toBe(true);
    });

    it('validates Brand Action: Charcoal (#202522) on Green (#68CE39) achieves >= 4.5:1 (passes AAA >= 7.0:1)', () => {
      const ratio = calculateContrastRatio(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
      );
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(
        isWcagAccessible(
          OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
          OFFICIAL_BRAND_TOKENS.kinergyGreen,
          'AAA',
        ),
      ).toBe(true);
    });

    it('validates Outlined Action: Forest (#3F5F25) on White (#FFFFFF) achieves >= 4.5:1 (passes AAA >= 7.0:1)', () => {
      const ratio = calculateContrastRatio(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        APPROVED_NEUTRAL_TOKENS.white,
      );
      expect(ratio).toBeGreaterThanOrEqual(7.0);
      expect(
        isWcagAccessible(OFFICIAL_BRAND_TOKENS.kinergyForest, APPROVED_NEUTRAL_TOKENS.white, 'AAA'),
      ).toBe(true);
    });

    it('validates Outlined Action on Application Background: Forest (#3F5F25) on Background (#F8FAF9) achieves >= 4.5:1', () => {
      const ratio = calculateContrastRatio(
        OFFICIAL_BRAND_TOKENS.kinergyForest,
        APPROVED_NEUTRAL_TOKENS.background,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(
        isWcagAccessible(
          OFFICIAL_BRAND_TOKENS.kinergyForest,
          APPROVED_NEUTRAL_TOKENS.background,
          'AA',
        ),
      ).toBe(true);
    });

    it('validates Body Text: Charcoal (#202522) on Background (#F8FAF9) achieves >= 4.5:1 (passes AAA >= 7.0:1)', () => {
      const ratio = calculateContrastRatio(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        APPROVED_NEUTRAL_TOKENS.background,
      );
      expect(ratio).toBeGreaterThanOrEqual(14.0);
      expect(
        isWcagAccessible(
          OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
          APPROVED_NEUTRAL_TOKENS.background,
          'AAA',
        ),
      ).toBe(true);
    });

    it('validates Secondary Text: Text Secondary (#68716B) on Background (#F8FAF9) achieves >= 4.5:1', () => {
      const ratio = calculateContrastRatio(
        APPROVED_NEUTRAL_TOKENS.textSecondary,
        APPROVED_NEUTRAL_TOKENS.background,
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(
        isWcagAccessible(
          APPROVED_NEUTRAL_TOKENS.textSecondary,
          APPROVED_NEUTRAL_TOKENS.background,
          'AA',
        ),
      ).toBe(true);
    });

    it('validates all semantic status badge pairings satisfy WCAG 2.2 AA (>= 4.5:1)', () => {
      // Success: White on Forest
      expect(
        calculateContrastRatio(
          SEMANTIC_STATUS_TOKENS.success.foreground,
          SEMANTIC_STATUS_TOKENS.success.default,
        ),
      ).toBeGreaterThanOrEqual(4.5);

      // Warning: White on Amber-700
      expect(
        calculateContrastRatio(
          SEMANTIC_STATUS_TOKENS.warning.foreground,
          SEMANTIC_STATUS_TOKENS.warning.default,
        ),
      ).toBeGreaterThanOrEqual(4.5);

      // Danger: White on Red-700
      expect(
        calculateContrastRatio(
          SEMANTIC_STATUS_TOKENS.danger.foreground,
          SEMANTIC_STATUS_TOKENS.danger.default,
        ),
      ).toBeGreaterThanOrEqual(4.5);

      // Info: White on Sky-700
      expect(
        calculateContrastRatio(
          SEMANTIC_STATUS_TOKENS.info.foreground,
          SEMANTIC_STATUS_TOKENS.info.default,
        ),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('5. CSS Custom Properties Consistency Verification', () => {
    it('verifies globals.css declares all canonical brand and neutral variables', () => {
      // Find globals.css relative to repository root or directory
      const candidates = [
        path.resolve(process.cwd(), 'apps/web/src/shared/styles/globals.css'),
        path.resolve(__dirname, '../../../../../apps/web/src/shared/styles/globals.css'),
      ];
      const globalsCssPath = candidates.find((p) => fs.existsSync(p));
      expect(globalsCssPath).toBeDefined();
      expect(fs.existsSync(globalsCssPath!)).toBe(true);

      const rawContent = fs.readFileSync(globalsCssPath!, 'utf-8');
      const content = rawContent.toLowerCase();

      // Check official brand tokens
      expect(content).toContain('--kinergy-green: #68ce39;');
      expect(content).toContain('--kinergy-forest: #3f5f25;');
      expect(content).toContain('--kinergy-charcoal: #202522;');
      expect(content).toContain('--kinergy-soft: #e5f6d9;');
      expect(content).toContain('--kinergy-tint: #f4faef;');

      // Check approved neutrals
      expect(content).toContain('--color-white: #ffffff;');
      expect(content).toContain('--color-background: #f8faf9;');
      expect(content).toContain('--color-border: #d8ddd9;');
      expect(content).toContain('--color-text-secondary: #68716b;');

      // Check semantic status variables
      expect(content).toContain('--status-success:');
      expect(content).toContain('--status-warning:');
      expect(content).toContain('--status-danger:');
      expect(content).toContain('--status-info:');

      // Check chart tokens
      expect(content).toContain('--chart-1: #3f5f25;');
      expect(content).toContain('--chart-2: #68ce39;');
    });

    it('verifies LIGHT_SEMANTIC_COLORS correctly maps Primary to Forest and PrimaryForeground to White', () => {
      expect(LIGHT_SEMANTIC_COLORS.primary).toContain('93.1 43.9% 25.9%');
      expect(LIGHT_SEMANTIC_COLORS.primaryForeground).toBe('0 0% 100%');
      expect(LIGHT_SEMANTIC_COLORS.foreground).toContain('144 7.2% 13.5%');
      expect(LIGHT_SEMANTIC_COLORS.brand).toContain('101.1 60.3% 51.6%');
    });

    it('verifies root DESIGN_TOKENS references the canonical brand and neutral sets', () => {
      expect(DESIGN_TOKENS.brand).toEqual(OFFICIAL_BRAND_TOKENS);
      expect(DESIGN_TOKENS.neutrals).toEqual(APPROVED_NEUTRAL_TOKENS);
      expect(DESIGN_TOKENS.status).toEqual(SEMANTIC_STATUS_TOKENS);
      expect(DESIGN_TOKENS.charts).toEqual(CHART_TOKENS);
      expect(DESIGN_TOKENS.interaction).toEqual(INTERACTION_TOKENS);
    });
  });
});
