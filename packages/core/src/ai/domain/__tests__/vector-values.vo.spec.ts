import { VectorValues } from '../value-objects/vector-values.vo';
import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';

describe('VectorValues Value Object', () => {
  it('should instantiate valid VectorValues and compute L2 norm', () => {
    const raw = [3, 4];
    const vector = VectorValues.create(raw, 2);

    expect(vector.dimensions).toBe(2);
    expect(vector.values).toEqual([3, 4]);
    expect(vector.l2Norm()).toBeCloseTo(5.0);
    expect(vector.isUnitNormalized()).toBe(false);
  });

  it('should identify unit-normalized vectors accurately', () => {
    // [1/sqrt(2), 1/sqrt(2)]
    const val = 1 / Math.sqrt(2);
    const vector = VectorValues.create([val, val], 2);

    expect(vector.l2Norm()).toBeCloseTo(1.0);
    expect(vector.isUnitNormalized()).toBe(true);
  });

  it('should reject empty or non-array inputs', () => {
    expect(() => VectorValues.create([])).toThrow(EmbeddingValidationException);
  });

  it('should enforce expected dimensions when specified', () => {
    expect(() => VectorValues.create([0.1, 0.2, 0.3], 4)).toThrow(EmbeddingValidationException);
    expect(() => VectorValues.create([0.1, 0.2], 1024)).toThrow(EmbeddingValidationException);
  });

  it('should reject NaN values', () => {
    expect(() => VectorValues.create([0.1, NaN, 0.3])).toThrow(EmbeddingValidationException);
  });

  it('should reject positive and negative Infinity', () => {
    expect(() => VectorValues.create([0.1, Infinity, 0.3])).toThrow(EmbeddingValidationException);
    expect(() => VectorValues.create([0.1, -Infinity, 0.3])).toThrow(EmbeddingValidationException);
  });

  it('should correctly evaluate vector equality within epsilon tolerance', () => {
    const v1 = VectorValues.create([0.1234567, 0.7654321]);
    const v2 = VectorValues.create([0.1234567, 0.7654321]);
    const v3 = VectorValues.create([0.1234568, 0.7654321]);

    expect(v1.equals(v2)).toBe(true);
    expect(v1.equals(v3, 1e-8)).toBe(false);
  });

  it('should be immutable and frozen', () => {
    const vector = VectorValues.create([1, 2, 3]);
    expect(Object.isFrozen(vector)).toBe(true);
    expect(Object.isFrozen(vector.values)).toBe(true);
  });
});
