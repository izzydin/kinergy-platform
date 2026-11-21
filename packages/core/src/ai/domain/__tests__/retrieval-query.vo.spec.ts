import { RetrievalQuery } from '../value-objects/retrieval-query.vo';
import { RetrievalCriteria } from '../value-objects/retrieval-criteria.vo';
import { SimilarityScore } from '../value-objects/similarity-score.vo';
import {
  EmptyRetrievalQueryException,
  InvalidRetrievalQueryException,
} from '../exceptions/retrieval.exceptions';

describe('RetrievalQuery Value Object', () => {
  const validCriteria = RetrievalCriteria.create({ tenantId: 'tenant-clinic-1' });

  it('should create valid query with default topK and minSimilarity', () => {
    const query = RetrievalQuery.create({
      query: 'lumbar rehabilitation protocol',
      criteria: validCriteria,
    });

    expect(query.rawQuery).toBe('lumbar rehabilitation protocol');
    expect(query.normalizedQuery).toBe('lumbar rehabilitation protocol');
    expect(query.topK).toBe(5);
    expect(query.minSimilarity.value).toBe(0.0);
    expect(query.criteria.tenantId).toBe('tenant-clinic-1');
  });

  it('should normalize unicode characters using NFKC', () => {
    const query = RetrievalQuery.create({
      query: 'rehabilitaci\u006F\u0301n lumbar \uFB01n', // decomposed ó and ligature ﬁ
      criteria: validCriteria,
    });

    expect(query.normalizedQuery).toBe('rehabilitación lumbar fin');
  });

  it('should reject empty or whitespace-only queries', () => {
    expect(() =>
      RetrievalQuery.create({
        query: '',
        criteria: validCriteria,
      }),
    ).toThrow(EmptyRetrievalQueryException);

    expect(() =>
      RetrievalQuery.create({
        query: '   \t\n   ',
        criteria: validCriteria,
      }),
    ).toThrow(EmptyRetrievalQueryException);
  });

  it('should reject queries exceeding 1000 characters', () => {
    const longQuery = 'a'.repeat(1001);
    expect(() =>
      RetrievalQuery.create({
        query: longQuery,
        criteria: validCriteria,
      }),
    ).toThrow(InvalidRetrievalQueryException);
  });

  it('should validate top-K boundaries [1, 50]', () => {
    expect(() =>
      RetrievalQuery.create({
        query: 'valid query',
        criteria: validCriteria,
        topK: 0,
      }),
    ).toThrow(InvalidRetrievalQueryException);

    expect(() =>
      RetrievalQuery.create({
        query: 'valid query',
        criteria: validCriteria,
        topK: 51,
      }),
    ).toThrow(InvalidRetrievalQueryException);

    const validMax = RetrievalQuery.create({
      query: 'valid query',
      criteria: validCriteria,
      topK: 50,
    });
    expect(validMax.topK).toBe(50);
  });

  it('should accept custom minSimilarity as number or SimilarityScore', () => {
    const q1 = RetrievalQuery.create({
      query: 'test',
      criteria: validCriteria,
      minSimilarity: 0.72,
    });
    expect(q1.minSimilarity.value).toBe(0.72);

    const scoreObj = SimilarityScore.create(0.81);
    const q2 = RetrievalQuery.create({
      query: 'test',
      criteria: validCriteria,
      minSimilarity: scoreObj,
    });
    expect(q2.minSimilarity.value).toBe(0.81);
  });
});
