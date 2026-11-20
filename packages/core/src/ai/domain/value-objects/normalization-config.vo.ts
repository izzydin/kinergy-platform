/**
 * Value Object representing the versioned configuration of the normalization pipeline.
 * Allows deterministic document cleaning, provenance recording, and future reprocessing
 * without loss of the original extracted or source artifacts.
 */
export type UnicodeNormalizationPolicy = 'NFC' | 'NFKC' | 'NONE';

export interface NormalizationConfigProps {
  readonly version?: string;
  readonly unicodePolicy?: UnicodeNormalizationPolicy;
  readonly collapseWhitespace?: boolean;
  readonly normalizeLineEndings?: boolean;
  readonly unwrapHyphenation?: boolean;
  readonly stripControlChars?: boolean;
  readonly removeFormattingArtifacts?: boolean;
  readonly detectLanguage?: boolean;
  readonly minLanguageDetectionChars?: number;
  readonly cleanHeaderFooterArtifacts?: boolean;
}

export class NormalizationConfig {
  public static readonly CURRENT_VERSION = '1.0.0';

  public readonly version: string;
  public readonly unicodePolicy: UnicodeNormalizationPolicy;
  public readonly collapseWhitespace: boolean;
  public readonly normalizeLineEndings: boolean;
  public readonly unwrapHyphenation: boolean;
  public readonly stripControlChars: boolean;
  public readonly removeFormattingArtifacts: boolean;
  public readonly detectLanguage: boolean;
  public readonly minLanguageDetectionChars: number;
  public readonly cleanHeaderFooterArtifacts: boolean;

  private constructor(props: NormalizationConfigProps = {}) {
    this.version = props.version ?? NormalizationConfig.CURRENT_VERSION;
    this.unicodePolicy = props.unicodePolicy ?? 'NFC';
    this.collapseWhitespace = props.collapseWhitespace ?? true;
    this.normalizeLineEndings = props.normalizeLineEndings ?? true;
    this.unwrapHyphenation = props.unwrapHyphenation ?? true;
    this.stripControlChars = props.stripControlChars ?? true;
    this.removeFormattingArtifacts = props.removeFormattingArtifacts ?? true;
    this.detectLanguage = props.detectLanguage ?? true;
    this.minLanguageDetectionChars = props.minLanguageDetectionChars ?? 20;
    this.cleanHeaderFooterArtifacts = props.cleanHeaderFooterArtifacts ?? true;
    Object.freeze(this);
  }

  public static default(): NormalizationConfig {
    return new NormalizationConfig();
  }

  public static create(props: NormalizationConfigProps): NormalizationConfig {
    return new NormalizationConfig(props);
  }

  public with(overrides: Partial<NormalizationConfigProps>): NormalizationConfig {
    return new NormalizationConfig({
      version: overrides.version ?? this.version,
      unicodePolicy: overrides.unicodePolicy ?? this.unicodePolicy,
      collapseWhitespace: overrides.collapseWhitespace ?? this.collapseWhitespace,
      normalizeLineEndings: overrides.normalizeLineEndings ?? this.normalizeLineEndings,
      unwrapHyphenation: overrides.unwrapHyphenation ?? this.unwrapHyphenation,
      stripControlChars: overrides.stripControlChars ?? this.stripControlChars,
      removeFormattingArtifacts:
        overrides.removeFormattingArtifacts ?? this.removeFormattingArtifacts,
      detectLanguage: overrides.detectLanguage ?? this.detectLanguage,
      minLanguageDetectionChars:
        overrides.minLanguageDetectionChars ?? this.minLanguageDetectionChars,
      cleanHeaderFooterArtifacts:
        overrides.cleanHeaderFooterArtifacts ?? this.cleanHeaderFooterArtifacts,
    });
  }
}
