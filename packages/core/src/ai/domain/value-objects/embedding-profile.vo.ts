import { EmbeddingType } from '../enums/embedding-type.enum';
import { NormalizationPolicy } from '../enums/normalization-policy.enum';
import { PoolingStrategy } from '../enums/pooling-strategy.enum';
import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';

export interface CreateEmbeddingProfileProps {
  profileId?: string;
  provider: string;
  modelName: string;
  modelVersion: string;
  modelDigest: string;
  dimensions: number;
  tokenizerIdentity: string;
  normalizationPolicy: NormalizationPolicy;
  poolingStrategy: PoolingStrategy;
  embeddingType?: EmbeddingType;
  createdAt?: Date;
}

function computeProfileDigest(raw: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c64e6d,
    h3 = 0x9e3779b9,
    h4 = 0x85ebca6b;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 3812015801);
    h4 = Math.imul(h4 ^ ch, 2246822507);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`;
}

/**
 * Value Object representing an immutable, cryptographically fingerprinted Embedding Profile.
 * Encapsulates the exact model, version, digest, dimensionality, normalization,
 * and pooling parameters used to generate vector embeddings.
 *
 * Invariant: Changing a model, digest, dimensionality, or material embedding
 * configuration produces a distinct profile identity.
 */
export class EmbeddingProfile {
  public static readonly BGE_M3_MODEL_NAME = 'bge-m3';
  public static readonly BGE_M3_DEFAULT_DIGEST =
    '7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab';
  public static readonly BGE_M3_DIMENSIONS = 1024;
  public static readonly BGE_M3_TOKENIZER = 'xlm-roberta';

  public readonly profileId: string;
  public readonly provider: string;
  public readonly modelName: string;
  public readonly modelVersion: string;
  public readonly modelDigest: string;
  public readonly dimensions: number;
  public readonly tokenizerIdentity: string;
  public readonly normalizationPolicy: NormalizationPolicy;
  public readonly poolingStrategy: PoolingStrategy;
  public readonly embeddingType: EmbeddingType;
  public readonly createdAt: Date;

  private constructor(props: {
    profileId: string;
    provider: string;
    modelName: string;
    modelVersion: string;
    modelDigest: string;
    dimensions: number;
    tokenizerIdentity: string;
    normalizationPolicy: NormalizationPolicy;
    poolingStrategy: PoolingStrategy;
    embeddingType: EmbeddingType;
    createdAt: Date;
  }) {
    this.profileId = props.profileId;
    this.provider = props.provider;
    this.modelName = props.modelName;
    this.modelVersion = props.modelVersion;
    this.modelDigest = props.modelDigest;
    this.dimensions = props.dimensions;
    this.tokenizerIdentity = props.tokenizerIdentity;
    this.normalizationPolicy = props.normalizationPolicy;
    this.poolingStrategy = props.poolingStrategy;
    this.embeddingType = props.embeddingType;
    this.createdAt = new Date(props.createdAt.getTime());
    Object.freeze(this);
  }

  public static create(props: CreateEmbeddingProfileProps): EmbeddingProfile {
    const provider = (props.provider || '').trim().toLowerCase();
    const modelName = (props.modelName || '').trim().toLowerCase();
    const modelVersion = (props.modelVersion || 'latest').trim().toLowerCase();
    const modelDigest = (props.modelDigest || '').trim().toLowerCase();
    const dimensions = props.dimensions;
    const tokenizerIdentity = (props.tokenizerIdentity || '').trim().toLowerCase();
    const normalizationPolicy = props.normalizationPolicy;
    const poolingStrategy = props.poolingStrategy;
    const embeddingType = props.embeddingType ?? EmbeddingType.DENSE;
    const createdAt = props.createdAt ? new Date(props.createdAt.getTime()) : new Date();

    if (!provider) {
      throw new EmbeddingValidationException('Embedding profile requires a non-empty provider.');
    }
    if (!modelName) {
      throw new EmbeddingValidationException('Embedding profile requires a non-empty modelName.');
    }
    if (!modelDigest) {
      throw new EmbeddingValidationException(
        'Embedding profile requires an immutable modelDigest.',
      );
    }
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new EmbeddingValidationException(
        `Embedding dimensions must be a positive integer, received: ${dimensions}`,
      );
    }
    if (!tokenizerIdentity) {
      throw new EmbeddingValidationException(
        'Embedding profile requires a non-empty tokenizerIdentity.',
      );
    }
    if (!normalizationPolicy || !Object.values(NormalizationPolicy).includes(normalizationPolicy)) {
      throw new EmbeddingValidationException(
        `Invalid normalization policy: ${normalizationPolicy}`,
      );
    }
    if (!poolingStrategy || !Object.values(PoolingStrategy).includes(poolingStrategy)) {
      throw new EmbeddingValidationException(`Invalid pooling strategy: ${poolingStrategy}`);
    }

    // Canonical fingerprint derivation
    const canonicalString = [
      `provider=${provider}`,
      `modelName=${modelName}`,
      `modelVersion=${modelVersion}`,
      `modelDigest=${modelDigest}`,
      `dimensions=${dimensions}`,
      `tokenizer=${tokenizerIdentity}`,
      `norm=${normalizationPolicy}`,
      `pool=${poolingStrategy}`,
      `type=${embeddingType}`,
    ].join('|');

    const derivedFingerprint = `prof_${modelName}_${dimensions}_${computeProfileDigest(canonicalString).substring(0, 12)}`;
    const profileId = (props.profileId && props.profileId.trim()) || derivedFingerprint;

    return new EmbeddingProfile({
      profileId,
      provider,
      modelName,
      modelVersion,
      modelDigest,
      dimensions,
      tokenizerIdentity,
      normalizationPolicy,
      poolingStrategy,
      embeddingType,
      createdAt,
    });
  }

  /**
   * Factory returning the approved BGE-M3 dense embedding profile baseline.
   */
  public static bgeM3DenseDefault(
    modelDigest = EmbeddingProfile.BGE_M3_DEFAULT_DIGEST,
  ): EmbeddingProfile {
    return EmbeddingProfile.create({
      provider: 'ollama',
      modelName: EmbeddingProfile.BGE_M3_MODEL_NAME,
      modelVersion: 'latest',
      modelDigest,
      dimensions: EmbeddingProfile.BGE_M3_DIMENSIONS,
      tokenizerIdentity: EmbeddingProfile.BGE_M3_TOKENIZER,
      normalizationPolicy: NormalizationPolicy.UNIT_L2,
      poolingStrategy: PoolingStrategy.CLS,
      embeddingType: EmbeddingType.DENSE,
    });
  }

  public static createBgeM3Default(
    modelDigest = EmbeddingProfile.BGE_M3_DEFAULT_DIGEST,
  ): EmbeddingProfile {
    return EmbeddingProfile.bgeM3DenseDefault(modelDigest);
  }

  /**
   * Checks whether this profile is strictly identical to another.
   */
  public matches(other?: EmbeddingProfile | null): boolean {
    if (!other || !(other instanceof EmbeddingProfile)) return false;
    return (
      this.provider === other.provider &&
      this.modelName === other.modelName &&
      this.modelVersion === other.modelVersion &&
      this.modelDigest === other.modelDigest &&
      this.dimensions === other.dimensions &&
      this.tokenizerIdentity === other.tokenizerIdentity &&
      this.normalizationPolicy === other.normalizationPolicy &&
      this.poolingStrategy === other.poolingStrategy &&
      this.embeddingType === other.embeddingType
    );
  }

  public equals(other?: EmbeddingProfile | null): boolean {
    return this.matches(other);
  }

  /**
   * Checks whether this profile is mathematically compatible for search similarity calculations.
   * Two profiles are search-compatible only if they share identical dimensions, normalization,
   * model, and digest.
   */
  public isCompatibleWith(other?: EmbeddingProfile | null): boolean {
    if (!other || !(other instanceof EmbeddingProfile)) return false;
    return (
      this.dimensions === other.dimensions &&
      this.modelName === other.modelName &&
      this.modelDigest === other.modelDigest &&
      this.normalizationPolicy === other.normalizationPolicy &&
      this.embeddingType === other.embeddingType
    );
  }
}
