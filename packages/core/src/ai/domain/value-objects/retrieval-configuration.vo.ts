import { RetrievalSearchMode } from '../enums/retrieval-search-mode.enum';
import { InvalidRetrievalConfigurationException } from '../exceptions/retrieval.exceptions';

export interface CreateRetrievalConfigurationProps {
  defaultTopK?: number;
  maxTopK?: number;
  similarityMetric?: 'cosine';
  searchMode?: RetrievalSearchMode;
  embeddingModel?: string;
  embeddingDimensions?: number;
  defaultMinSimilarity?: number;
  queryTimeoutMs?: number;
}

/**
 * Value Object representing system-wide and tenant-configurable semantic retrieval settings.
 *
 * Invariants:
 * - Dimensionality must strictly equal 1,024 for BGE-M3 parity.
 * - defaultTopK <= maxTopK.
 * - queryTimeoutMs must be positive.
 */
export class RetrievalConfiguration {
  public static readonly BGE_M3_DIMENSIONS = 1024;
  public static readonly DEFAULT_TIMEOUT_MS = 10000;

  public readonly defaultTopK: number;
  public readonly maxTopK: number;
  public readonly similarityMetric: 'cosine';
  public readonly searchMode: RetrievalSearchMode;
  public readonly embeddingModel: string;
  public readonly embeddingDimensions: number;
  public readonly defaultMinSimilarity: number;
  public readonly queryTimeoutMs: number;

  private constructor(props: {
    defaultTopK: number;
    maxTopK: number;
    similarityMetric: 'cosine';
    searchMode: RetrievalSearchMode;
    embeddingModel: string;
    embeddingDimensions: number;
    defaultMinSimilarity: number;
    queryTimeoutMs: number;
  }) {
    this.defaultTopK = props.defaultTopK;
    this.maxTopK = props.maxTopK;
    this.similarityMetric = props.similarityMetric;
    this.searchMode = props.searchMode;
    this.embeddingModel = props.embeddingModel;
    this.embeddingDimensions = props.embeddingDimensions;
    this.defaultMinSimilarity = props.defaultMinSimilarity;
    this.queryTimeoutMs = props.queryTimeoutMs;
    Object.freeze(this);
  }

  public static create(props: CreateRetrievalConfigurationProps = {}): RetrievalConfiguration {
    const defaultTopK = props.defaultTopK ?? 5;
    const maxTopK = props.maxTopK ?? 50;

    if (!Number.isInteger(defaultTopK) || defaultTopK < 1) {
      throw new InvalidRetrievalConfigurationException(
        `defaultTopK must be a positive integer, received: ${defaultTopK}`,
      );
    }

    if (!Number.isInteger(maxTopK) || maxTopK < defaultTopK) {
      throw new InvalidRetrievalConfigurationException(
        `maxTopK must be greater than or equal to defaultTopK (${defaultTopK}), received: ${maxTopK}`,
      );
    }

    const embeddingDimensions =
      props.embeddingDimensions ?? RetrievalConfiguration.BGE_M3_DIMENSIONS;
    if (embeddingDimensions !== RetrievalConfiguration.BGE_M3_DIMENSIONS) {
      throw new InvalidRetrievalConfigurationException(
        `BGE-M3 retrieval strictly requires 1,024 dimensions, received: ${embeddingDimensions}`,
      );
    }

    const defaultMinSim = props.defaultMinSimilarity ?? 0.0;
    if (defaultMinSim < 0.0 || defaultMinSim > 1.0) {
      throw new InvalidRetrievalConfigurationException(
        `defaultMinSimilarity must be in [0.0, 1.0], received: ${defaultMinSim}`,
      );
    }

    const timeout = props.queryTimeoutMs ?? RetrievalConfiguration.DEFAULT_TIMEOUT_MS;
    if (timeout <= 0) {
      throw new InvalidRetrievalConfigurationException(
        `queryTimeoutMs must be positive, received: ${timeout}`,
      );
    }

    return new RetrievalConfiguration({
      defaultTopK,
      maxTopK,
      similarityMetric: 'cosine',
      searchMode: props.searchMode ?? RetrievalSearchMode.SEMANTIC,
      embeddingModel: (props.embeddingModel || 'bge-m3').trim(),
      embeddingDimensions,
      defaultMinSimilarity: defaultMinSim,
      queryTimeoutMs: timeout,
    });
  }

  public static default(): RetrievalConfiguration {
    return RetrievalConfiguration.create();
  }
}
