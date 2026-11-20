import { NormalizationConfig } from '../value-objects/normalization-config.vo';

describe('NormalizationConfig (Value Object)', () => {
  it('instantiates default configuration with approved enterprise parameters', () => {
    const config = NormalizationConfig.default();

    expect(config.version).toBe('1.0.0');
    expect(config.unicodePolicy).toBe('NFC');
    expect(config.collapseWhitespace).toBe(true);
    expect(config.normalizeLineEndings).toBe(true);
    expect(config.unwrapHyphenation).toBe(true);
    expect(config.stripControlChars).toBe(true);
    expect(config.removeFormattingArtifacts).toBe(true);
    expect(config.detectLanguage).toBe(true);
    expect(config.minLanguageDetectionChars).toBe(20);
    expect(config.cleanHeaderFooterArtifacts).toBe(true);
  });

  it('allows immutable creation with specific overrides using with()', () => {
    const defaultConfig = NormalizationConfig.default();
    const customConfig = defaultConfig.with({
      unicodePolicy: 'NONE',
      collapseWhitespace: false,
      minLanguageDetectionChars: 50,
    });

    expect(customConfig.unicodePolicy).toBe('NONE');
    expect(customConfig.collapseWhitespace).toBe(false);
    expect(customConfig.minLanguageDetectionChars).toBe(50);

    // Invariant: Original remains unmodified (immutability)
    expect(defaultConfig.unicodePolicy).toBe('NFC');
    expect(defaultConfig.collapseWhitespace).toBe(true);
  });
});
