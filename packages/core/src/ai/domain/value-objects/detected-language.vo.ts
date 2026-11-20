/**
 * Value Object representing the outcome of deterministic language detection.
 * Carries ISO 639-1 code ('es', 'en'), 'mixed', or 'und' (undetermined/unknown),
 * accompanied by an explicit confidence score and character sample size.
 */
export interface LanguageDistribution {
  readonly es: number;
  readonly en: number;
  readonly [key: string]: number;
}

export interface DetectedLanguageResultProps {
  readonly language: string;
  readonly confidence: number;
  readonly isReliable: boolean;
  readonly sampleCharCount: number;
  readonly distribution?: LanguageDistribution;
}

export class DetectedLanguageResult {
  public readonly language: string;
  public readonly confidence: number;
  public readonly isReliable: boolean;
  public readonly sampleCharCount: number;
  public readonly distribution?: Readonly<LanguageDistribution>;

  private constructor(props: DetectedLanguageResultProps) {
    this.language = props.language.toLowerCase().trim();
    this.confidence = Math.min(Math.max(props.confidence, 0.0), 1.0);
    this.isReliable = props.isReliable;
    this.sampleCharCount = Math.max(0, props.sampleCharCount);
    this.distribution = props.distribution ? Object.freeze({ ...props.distribution }) : undefined;
    Object.freeze(this);
  }

  public static create(props: DetectedLanguageResultProps): DetectedLanguageResult {
    return new DetectedLanguageResult(props);
  }

  public static spanish(confidence = 0.95, sampleCharCount = 0): DetectedLanguageResult {
    return new DetectedLanguageResult({
      language: 'es',
      confidence,
      isReliable: confidence >= 0.7,
      sampleCharCount,
      distribution: { es: 1.0, en: 0.0 },
    });
  }

  public static english(confidence = 0.95, sampleCharCount = 0): DetectedLanguageResult {
    return new DetectedLanguageResult({
      language: 'en',
      confidence,
      isReliable: confidence >= 0.7,
      sampleCharCount,
      distribution: { es: 0.0, en: 1.0 },
    });
  }

  public static mixed(
    confidence = 0.8,
    distribution: LanguageDistribution = { es: 0.5, en: 0.5 },
    sampleCharCount = 0,
  ): DetectedLanguageResult {
    return new DetectedLanguageResult({
      language: 'mixed',
      confidence,
      isReliable: confidence >= 0.6,
      sampleCharCount,
      distribution,
    });
  }

  public static undetermined(sampleCharCount = 0, _reason?: string): DetectedLanguageResult {
    return new DetectedLanguageResult({
      language: 'und',
      confidence: 0.0,
      isReliable: false,
      sampleCharCount,
      distribution: { es: 0.0, en: 0.0 },
    });
  }

  public isSpanish(): boolean {
    return this.language === 'es';
  }

  public isEnglish(): boolean {
    return this.language === 'en';
  }

  public isMixed(): boolean {
    return this.language === 'mixed';
  }

  public isUndetermined(): boolean {
    return this.language === 'und' || this.language === 'unknown';
  }

  public equals(other: DetectedLanguageResult | null | undefined): boolean {
    if (!other) return false;
    return this.language === other.language && this.confidence === other.confidence;
  }
}
