import { DetectedLanguageResult } from '../value-objects/detected-language.vo';

describe('DetectedLanguageResult (Value Object)', () => {
  it('creates Spanish result with high confidence and reliability flag', () => {
    const result = DetectedLanguageResult.spanish(0.92, 150);

    expect(result.language).toBe('es');
    expect(result.confidence).toBe(0.92);
    expect(result.isReliable).toBe(true);
    expect(result.sampleCharCount).toBe(150);
    expect(result.isSpanish()).toBe(true);
    expect(result.isEnglish()).toBe(false);
    expect(result.isMixed()).toBe(false);
    expect(result.isUndetermined()).toBe(false);
  });

  it('creates English result with high confidence', () => {
    const result = DetectedLanguageResult.english(0.88, 200);

    expect(result.language).toBe('en');
    expect(result.confidence).toBe(0.88);
    expect(result.isReliable).toBe(true);
    expect(result.isEnglish()).toBe(true);
    expect(result.isSpanish()).toBe(false);
  });

  it('creates mixed language result with distribution', () => {
    const result = DetectedLanguageResult.mixed(0.85, { es: 0.6, en: 0.4 }, 300);

    expect(result.language).toBe('mixed');
    expect(result.isMixed()).toBe(true);
    expect(result.distribution).toEqual({ es: 0.6, en: 0.4 });
    expect(result.isReliable).toBe(true);
  });

  it('creates undetermined language result with zero confidence', () => {
    const result = DetectedLanguageResult.undetermined(10);

    expect(result.language).toBe('und');
    expect(result.confidence).toBe(0.0);
    expect(result.isReliable).toBe(false);
    expect(result.isUndetermined()).toBe(true);
  });

  it('clamps confidence strictly between 0.0 and 1.0', () => {
    const over = DetectedLanguageResult.create({
      language: 'es',
      confidence: 1.5,
      isReliable: true,
      sampleCharCount: 50,
    });
    expect(over.confidence).toBe(1.0);

    const under = DetectedLanguageResult.create({
      language: 'en',
      confidence: -0.5,
      isReliable: false,
      sampleCharCount: 50,
    });
    expect(under.confidence).toBe(0.0);
  });

  it('enforces value object equality', () => {
    const r1 = DetectedLanguageResult.spanish(0.9, 100);
    const r2 = DetectedLanguageResult.spanish(0.9, 200); // same lang and confidence
    const r3 = DetectedLanguageResult.spanish(0.8, 100);

    expect(r1.equals(r2)).toBe(true);
    expect(r1.equals(r3)).toBe(false);
    expect(r1.equals(null)).toBe(false);
  });
});
