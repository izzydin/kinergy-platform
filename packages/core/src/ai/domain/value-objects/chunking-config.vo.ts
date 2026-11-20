import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

export interface ChunkingConfigProps {
  readonly targetChunkTokens?: number;
  readonly minimumChunkTokens?: number;
  readonly maximumChunkTokens?: number;
  readonly overlapTokens?: number;
  readonly strategy?: string;
  readonly version?: string;
}

/**
 * Value Object representing the immutable, versioned configuration for document chunking.
 * Enforces architectural constraints (target, min, max, overlap token boundaries)
 * and guarantees reproducible, deterministic chunking operations.
 */
export class ChunkingConfig {
  public static readonly DEFAULT_TARGET_TOKENS = 450;
  public static readonly DEFAULT_MINIMUM_TOKENS = 400;
  public static readonly DEFAULT_MAXIMUM_TOKENS = 500;
  public static readonly DEFAULT_OVERLAP_TOKENS = 60;
  public static readonly DEFAULT_STRATEGY = 'structure-aware';
  public static readonly DEFAULT_VERSION = '1.0.0';

  public readonly targetChunkTokens: number;
  public readonly minimumChunkTokens: number;
  public readonly maximumChunkTokens: number;
  public readonly overlapTokens: number;
  public readonly strategy: string;
  public readonly version: string;

  private constructor(props: {
    targetChunkTokens: number;
    minimumChunkTokens: number;
    maximumChunkTokens: number;
    overlapTokens: number;
    strategy: string;
    version: string;
  }) {
    this.targetChunkTokens = props.targetChunkTokens;
    this.minimumChunkTokens = props.minimumChunkTokens;
    this.maximumChunkTokens = props.maximumChunkTokens;
    this.overlapTokens = props.overlapTokens;
    this.strategy = props.strategy;
    this.version = props.version;
    Object.freeze(this);
  }

  public static create(props: ChunkingConfigProps = {}): ChunkingConfig {
    const target = props.targetChunkTokens ?? ChunkingConfig.DEFAULT_TARGET_TOKENS;
    const min = props.minimumChunkTokens ?? ChunkingConfig.DEFAULT_MINIMUM_TOKENS;
    const max = props.maximumChunkTokens ?? ChunkingConfig.DEFAULT_MAXIMUM_TOKENS;
    const overlap = props.overlapTokens ?? ChunkingConfig.DEFAULT_OVERLAP_TOKENS;
    const strategy = (props.strategy ?? ChunkingConfig.DEFAULT_STRATEGY).trim();
    const version = (props.version ?? ChunkingConfig.DEFAULT_VERSION).trim();

    if (!Number.isInteger(min) || min <= 0) {
      throw new DocumentValidationException(
        `minimumChunkTokens must be a positive integer > 0, received: ${min}`,
      );
    }
    if (!Number.isInteger(max) || max <= 0) {
      throw new DocumentValidationException(
        `maximumChunkTokens must be a positive integer > 0, received: ${max}`,
      );
    }
    if (!Number.isInteger(target) || target <= 0) {
      throw new DocumentValidationException(
        `targetChunkTokens must be a positive integer > 0, received: ${target}`,
      );
    }
    if (min > max) {
      throw new DocumentValidationException(
        `minimumChunkTokens (${min}) cannot exceed maximumChunkTokens (${max}).`,
      );
    }
    if (target < min || target > max) {
      throw new DocumentValidationException(
        `targetChunkTokens (${target}) must be between minimumChunkTokens (${min}) and maximumChunkTokens (${max}).`,
      );
    }
    if (!Number.isInteger(overlap) || overlap < 0) {
      throw new DocumentValidationException(
        `overlapTokens must be a non-negative integer >= 0, received: ${overlap}`,
      );
    }
    if (overlap >= min) {
      throw new DocumentValidationException(
        `overlapTokens (${overlap}) must be strictly less than minimumChunkTokens (${min}) to prevent redundant infinite chunk loops.`,
      );
    }
    if (strategy.length === 0) {
      throw new DocumentValidationException('Chunking strategy cannot be empty.');
    }
    if (version.length === 0) {
      throw new DocumentValidationException('Chunking configuration version cannot be empty.');
    }

    return new ChunkingConfig({
      targetChunkTokens: target,
      minimumChunkTokens: min,
      maximumChunkTokens: max,
      overlapTokens: overlap,
      strategy,
      version,
    });
  }

  public static default(): ChunkingConfig {
    return ChunkingConfig.create();
  }

  public equals(other?: ChunkingConfig | null): boolean {
    if (!other || !(other instanceof ChunkingConfig)) {
      return false;
    }
    return (
      this.targetChunkTokens === other.targetChunkTokens &&
      this.minimumChunkTokens === other.minimumChunkTokens &&
      this.maximumChunkTokens === other.maximumChunkTokens &&
      this.overlapTokens === other.overlapTokens &&
      this.strategy === other.strategy &&
      this.version === other.version
    );
  }
}
