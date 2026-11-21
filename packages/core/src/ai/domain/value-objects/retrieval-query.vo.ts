import { SimilarityScore } from './similarity-score.vo';
import { RetrievalCriteria } from './retrieval-criteria.vo';
import {
  EmptyRetrievalQueryException,
  InvalidRetrievalQueryException,
} from '../exceptions/retrieval.exceptions';
import { RetrievalErrorCode } from '../enums/retrieval-error-code.enum';

export interface CreateRetrievalQueryProps {
  query: string;
  criteria: RetrievalCriteria;
  topK?: number;
  minSimilarity?: SimilarityScore | number;
}

/**
 * Value Object encapsulating a validated, normalized semantic retrieval query.
 *
 * Invariants:
 * - Query must be non-empty and non-whitespace.
 * - Maximum character length: 1,000 characters.
 * - Top-K: Integer within [1, 50].
 * - Minimum similarity: Validated SimilarityScore (defaults to 0.0).
 */
export class RetrievalQuery {
  public static readonly MAX_QUERY_LENGTH = 1000;
  public static readonly DEFAULT_TOP_K = 5;
  public static readonly MAX_TOP_K = 50;

  public readonly rawQuery: string;
  public readonly normalizedQuery: string;
  public readonly topK: number;
  public readonly minSimilarity: SimilarityScore;
  public readonly criteria: RetrievalCriteria;

  private constructor(props: {
    rawQuery: string;
    normalizedQuery: string;
    topK: number;
    minSimilarity: SimilarityScore;
    criteria: RetrievalCriteria;
  }) {
    this.rawQuery = props.rawQuery;
    this.normalizedQuery = props.normalizedQuery;
    this.topK = props.topK;
    this.minSimilarity = props.minSimilarity;
    this.criteria = props.criteria;
    Object.freeze(this);
  }

  public static create(props: CreateRetrievalQueryProps): RetrievalQuery {
    if (!props.query || typeof props.query !== 'string') {
      throw new EmptyRetrievalQueryException('Retrieval query must be a non-empty string.');
    }

    const trimmed = props.query.trim();
    if (trimmed.length === 0) {
      throw new EmptyRetrievalQueryException(
        'Retrieval query cannot consist solely of whitespace.',
      );
    }

    if (trimmed.length > RetrievalQuery.MAX_QUERY_LENGTH) {
      throw new InvalidRetrievalQueryException(
        `Retrieval query length (${trimmed.length}) exceeds maximum allowable length of ${RetrievalQuery.MAX_QUERY_LENGTH} characters.`,
        RetrievalErrorCode.QUERY_TOO_LONG,
      );
    }

    const topK = props.topK !== undefined ? props.topK : RetrievalQuery.DEFAULT_TOP_K;
    if (!Number.isInteger(topK) || topK < 1 || topK > RetrievalQuery.MAX_TOP_K) {
      throw new InvalidRetrievalQueryException(
        `Top-K must be an integer between 1 and ${RetrievalQuery.MAX_TOP_K}, received: ${topK}`,
        RetrievalErrorCode.INVALID_TOP_K,
      );
    }

    let minSimilarity: SimilarityScore;
    if (props.minSimilarity instanceof SimilarityScore) {
      minSimilarity = props.minSimilarity;
    } else if (typeof props.minSimilarity === 'number') {
      minSimilarity = SimilarityScore.create(props.minSimilarity);
    } else {
      minSimilarity = SimilarityScore.create(0.0);
    }

    if (!props.criteria || !(props.criteria instanceof RetrievalCriteria)) {
      throw new InvalidRetrievalQueryException(
        'RetrievalQuery requires a valid RetrievalCriteria instance.',
        RetrievalErrorCode.RETRIEVAL_UNAUTHORIZED,
      );
    }

    // Unicode NFKC normalization on query text to match document indexing normalization
    const normalized = trimmed.normalize('NFKC');

    return new RetrievalQuery({
      rawQuery: props.query,
      normalizedQuery: normalized,
      topK,
      minSimilarity,
      criteria: props.criteria,
    });
  }
}
