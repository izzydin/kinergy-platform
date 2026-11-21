import { SimilarityScore } from '../value-objects/similarity-score.vo';
import { InvalidSimilarityScoreException } from '../exceptions/retrieval.exceptions';

describe('SimilarityScore Value Object', () => {
  it('should create valid similarity score within [0.0, 1.0]', () => {
    const score = SimilarityScore.create(0.85);
    expect(score.value).toBe(0.85);
    expect(score.toCosineDistance()).toBe(0.15);
  });

  it('should reject non-finite and NaN values', () => {
    expect(() => SimilarityScore.create(NaN)).toThrow(InvalidSimilarityScoreException);
    expect(() => SimilarityScore.create(Infinity)).toThrow(InvalidSimilarityScoreException);
    expect(() => SimilarityScore.create(-Infinity)).toThrow(InvalidSimilarityScoreException);
  });

  it('should reject values outside [0.0, 1.0]', () => {
    expect(() => SimilarityScore.create(-0.01)).toThrow(InvalidSimilarityScoreException);
    expect(() => SimilarityScore.create(1.0001)).toThrow(InvalidSimilarityScoreException);
  });

  it('should correctly convert from cosine distance', () => {
    // distance 0.0 -> similarity 1.0
    const perfectMatch = SimilarityScore.fromCosineDistance(0.0);
    expect(perfectMatch.value).toBe(1.0);

    // distance 0.15 -> similarity 0.85
    const match = SimilarityScore.fromCosineDistance(0.15);
    expect(match.value).toBe(0.85);

    // distance 1.0 -> similarity 0.0 (orthogonal)
    const orthogonal = SimilarityScore.fromCosineDistance(1.0);
    expect(orthogonal.value).toBe(0.0);

    // distance > 1.0 (clamped to 0.0 similarity)
    const opposite = SimilarityScore.fromCosineDistance(1.8);
    expect(opposite.value).toBe(0.0);
  });

  it('should reject invalid distance types', () => {
    expect(() => SimilarityScore.fromCosineDistance(NaN)).toThrow(InvalidSimilarityScoreException);
    expect(() => SimilarityScore.fromCosineDistance(Infinity)).toThrow(
      InvalidSimilarityScoreException,
    );
  });

  it('should correctly evaluate threshold satisfaction', () => {
    const score = SimilarityScore.create(0.75);
    expect(score.meetsThreshold(0.7)).toBe(true);
    expect(score.meetsThreshold(0.75)).toBe(true);
    expect(score.meetsThreshold(0.8)).toBe(false);

    const thresholdObj = SimilarityScore.create(0.72);
    expect(score.meetsThreshold(thresholdObj)).toBe(true);
  });

  it('should evaluate equality with epsilon tolerance', () => {
    const s1 = SimilarityScore.create(0.750001);
    const s2 = SimilarityScore.create(0.750001);
    const s3 = SimilarityScore.create(0.751);

    expect(s1.equals(s2)).toBe(true);
    expect(s1.equals(s3)).toBe(false);
    expect(s1.equals(null)).toBe(false);
  });
});
