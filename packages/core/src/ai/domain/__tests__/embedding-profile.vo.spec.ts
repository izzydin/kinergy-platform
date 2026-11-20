import { EmbeddingProfile } from '../value-objects/embedding-profile.vo';
import { EmbeddingType } from '../enums/embedding-type.enum';
import { NormalizationPolicy } from '../enums/normalization-policy.enum';
import { PoolingStrategy } from '../enums/pooling-strategy.enum';
import { EmbeddingValidationException } from '../exceptions/vector-indexing.exceptions';

describe('EmbeddingProfile Value Object', () => {
  const validProps = {
    provider: 'ollama',
    modelName: 'bge-m3',
    modelVersion: 'latest',
    modelDigest: 'sha256:b65345710ea1e17d23f79e5e6a88b584dbe8202d6896206c748c9735d463bca2',
    dimensions: 1024,
    tokenizerIdentity: 'xlm-roberta',
    normalizationPolicy: NormalizationPolicy.UNIT_L2,
    poolingStrategy: PoolingStrategy.CLS,
    embeddingType: EmbeddingType.DENSE,
  };

  it('should create an immutable EmbeddingProfile with deterministic profileId', () => {
    const profile = EmbeddingProfile.create(validProps);

    expect(profile).toBeDefined();
    expect(profile.provider).toBe('ollama');
    expect(profile.modelName).toBe('bge-m3');
    expect(profile.dimensions).toBe(1024);
    expect(profile.tokenizerIdentity).toBe('xlm-roberta');
    expect(profile.normalizationPolicy).toBe(NormalizationPolicy.UNIT_L2);
    expect(profile.profileId).toContain('prof_bge-m3_1024_');
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it('should produce identical profileId for identical configurations', () => {
    const profile1 = EmbeddingProfile.create(validProps);
    const profile2 = EmbeddingProfile.create({ ...validProps });

    expect(profile1.profileId).toBe(profile2.profileId);
    expect(profile1.equals(profile2)).toBe(true);
  });

  it('should create pre-configured BGE-M3 default profile', () => {
    const bgeProfile = EmbeddingProfile.createBgeM3Default();

    expect(bgeProfile.modelName).toBe('bge-m3');
    expect(bgeProfile.dimensions).toBe(1024);
    expect(bgeProfile.normalizationPolicy).toBe(NormalizationPolicy.UNIT_L2);
    expect(bgeProfile.embeddingType).toBe(EmbeddingType.DENSE);
  });

  it('should detect compatible profiles with matching dimensions, normalization, and model', () => {
    const profile1 = EmbeddingProfile.create(validProps);
    const profile2 = EmbeddingProfile.create(validProps);

    expect(profile1.isCompatibleWith(profile2)).toBe(true);
  });

  it('should detect incompatible profiles when dimensions or normalization differ', () => {
    const profile1 = EmbeddingProfile.create(validProps);
    const profile2 = EmbeddingProfile.create({
      ...validProps,
      dimensions: 768,
    });
    const profile3 = EmbeddingProfile.create({
      ...validProps,
      normalizationPolicy: NormalizationPolicy.NONE,
    });

    expect(profile1.isCompatibleWith(profile2)).toBe(false);
    expect(profile1.isCompatibleWith(profile3)).toBe(false);
  });

  it('should reject non-positive dimensions', () => {
    expect(() =>
      EmbeddingProfile.create({
        ...validProps,
        dimensions: -1,
      }),
    ).toThrow(EmbeddingValidationException);

    expect(() =>
      EmbeddingProfile.create({
        ...validProps,
        dimensions: 0,
      }),
    ).toThrow(EmbeddingValidationException);
  });

  it('should reject empty provider or model name', () => {
    expect(() =>
      EmbeddingProfile.create({
        ...validProps,
        provider: '   ',
      }),
    ).toThrow(EmbeddingValidationException);

    expect(() =>
      EmbeddingProfile.create({
        ...validProps,
        modelName: '',
      }),
    ).toThrow(EmbeddingValidationException);
  });
});
