import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';

/**
 * Value Object encapsulating an immutable high-dimensional numerical vector.
 * Enforces strict mathematical invariants:
 * - Dimensionality compliance.
 * - Rejection of NaN, Infinity, and non-numeric values.
 * - L2 Euclidean norm calculation.
 */
export class VectorValues {
  private readonly _values: readonly number[];
  private readonly _dimensions: number;

  private constructor(values: readonly number[], expectedDimensions?: number) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new EmbeddingValidationException('Vector values must be a non-empty array of numbers.');
    }

    if (expectedDimensions !== undefined) {
      if (!Number.isInteger(expectedDimensions) || expectedDimensions <= 0) {
        throw new EmbeddingValidationException(
          `Expected dimensions must be a positive integer, received: ${expectedDimensions}`,
        );
      }
      if (values.length !== expectedDimensions) {
        throw new EmbeddingValidationException(
          `Vector dimension mismatch: expected ${expectedDimensions}, received ${values.length}`,
        );
      }
    }

    // Verify all floats are finite numbers
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
        throw new EmbeddingValidationException(
          `Vector contains invalid non-finite value at index ${i}: ${val}`,
        );
      }
    }

    this._values = Object.freeze([...values]);
    this._dimensions = this._values.length;
    Object.freeze(this);
  }

  public static create(values: readonly number[], expectedDimensions?: number): VectorValues {
    return new VectorValues(values, expectedDimensions);
  }

  public static fromArray(values: readonly number[], expectedDimensions?: number): VectorValues {
    return new VectorValues(values, expectedDimensions);
  }

  public get values(): readonly number[] {
    return this._values;
  }

  public get dimensions(): number {
    return this._dimensions;
  }

  /**
   * Calculates the Euclidean (L2) norm of the vector: ||v|| = sqrt(sum(v_i^2)).
   */
  public l2Norm(): number {
    let sumSquares = 0;
    for (let i = 0; i < this._dimensions; i++) {
      const val = this._values[i] ?? 0;
      sumSquares += val * val;
    }
    return Math.sqrt(sumSquares);
  }

  /**
   * Checks whether the vector is unit-normalized (||v|| approx 1.0) within tolerance.
   */
  public isUnitNormalized(tolerance = 0.001): boolean {
    const norm = this.l2Norm();
    return Math.abs(norm - 1.0) <= tolerance;
  }

  /**
   * Compares equality with another vector within floating point precision threshold.
   */
  public equals(other?: VectorValues | null, epsilon = 1e-7): boolean {
    if (!other || !(other instanceof VectorValues)) return false;
    if (this._dimensions !== other.dimensions) return false;
    const otherVals = other.values;
    for (let i = 0; i < this._dimensions; i++) {
      const v1 = this._values[i] ?? 0;
      const v2 = otherVals[i] ?? 0;
      if (Math.abs(v1 - v2) > epsilon) {
        return false;
      }
    }
    return true;
  }

  public toArray(): number[] {
    return [...this._values];
  }
}
