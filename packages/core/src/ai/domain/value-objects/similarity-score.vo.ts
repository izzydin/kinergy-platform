import { InvalidSimilarityScoreException } from '../exceptions/retrieval.exceptions';

/**
 * Value Object representing a normalized Cosine Similarity score in the closed interval [0.0, 1.0].
 *
 * Enforces strict mathematical invariants:
 * - Rejects non-finite values (NaN, Infinity).
 * - Enforces bounded range [0.0, 1.0].
 * - Provides distance conversion: similarity = 1 - cosine_distance.
 */
export class SimilarityScore {
  private readonly _value: number;

  private constructor(value: number) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Number.isNaN(value)) {
      throw new InvalidSimilarityScoreException(
        `Similarity score must be a finite number, received: ${value}`,
      );
    }

    if (value < 0.0 || value > 1.0) {
      throw new InvalidSimilarityScoreException(
        `Similarity score must be in the interval [0.0, 1.0], received: ${value}`,
      );
    }

    // Fix floating point precision to 6 decimal places to prevent micro-rounding errors
    this._value = Math.round(value * 1_000_000) / 1_000_000;
    Object.freeze(this);
  }

  public static create(value: number): SimilarityScore {
    return new SimilarityScore(value);
  }

  /**
   * Constructs a SimilarityScore from pgvector cosine distance:
   * similarity = 1 - cosine_distance.
   * Clamps distance within [0.0, 2.0] and resulting similarity to [0.0, 1.0].
   */
  public static fromCosineDistance(distance: number): SimilarityScore {
    if (typeof distance !== 'number' || !Number.isFinite(distance) || Number.isNaN(distance)) {
      throw new InvalidSimilarityScoreException(
        `Cosine distance must be a finite number, received: ${distance}`,
      );
    }

    // Cosine distance is strictly in [0, 2]. Negative distances are clamped to 0.
    const clampedDistance = Math.max(0.0, Math.min(2.0, distance));
    const rawSimilarity = 1.0 - clampedDistance;
    const clampedSimilarity = Math.max(0.0, Math.min(1.0, rawSimilarity));

    return new SimilarityScore(clampedSimilarity);
  }

  public get value(): number {
    return this._value;
  }

  /**
   * Converts back to cosine distance: distance = 1 - similarity.
   */
  public toCosineDistance(): number {
    return Math.round((1.0 - this._value) * 1_000_000) / 1_000_000;
  }

  /**
   * Evaluates if this score meets or exceeds a target threshold.
   */
  public meetsThreshold(threshold: SimilarityScore | number): boolean {
    const minVal = threshold instanceof SimilarityScore ? threshold.value : threshold;
    return this._value >= minVal;
  }

  public equals(other?: SimilarityScore | null, epsilon = 1e-6): boolean {
    if (!other || !(other instanceof SimilarityScore)) return false;
    return Math.abs(this._value - other.value) <= epsilon;
  }

  public toString(): string {
    return this._value.toFixed(6);
  }
}
