import { ModelChangeDetectorService } from '../model-change-detector.service';
import { EmbeddingProfile, NormalizationPolicy } from '@kinergy-platform/core';

describe('ModelChangeDetectorService', () => {
  let detector: ModelChangeDetectorService;
  let baselineProfile: EmbeddingProfile;

  beforeEach(() => {
    detector = new ModelChangeDetectorService();
    baselineProfile = EmbeddingProfile.bgeM3DenseDefault();
  });

  it('detects no change when candidate metadata matches baseline profile exactly', () => {
    const result = detector.detectModelChange(baselineProfile, {
      provider: baselineProfile.provider,
      modelName: baselineProfile.modelName,
      modelVersion: baselineProfile.modelVersion,
      modelDigest: baselineProfile.modelDigest,
      dimensions: baselineProfile.dimensions,
      tokenizerIdentity: baselineProfile.tokenizerIdentity,
      normalizationPolicy: baselineProfile.normalizationPolicy,
      poolingStrategy: baselineProfile.poolingStrategy,
    });

    expect(result.hasChanged).toBe(false);
    expect(result.isMaterialChange).toBe(false);
    expect(result.differences).toHaveLength(0);
    expect(result.candidateProfile.profileId).toBe(baselineProfile.profileId);
  });

  it('detects material change when model digest changes', () => {
    const newDigest = '8888888888888888a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab';

    const result = detector.detectModelChange(baselineProfile, {
      provider: baselineProfile.provider,
      modelName: baselineProfile.modelName,
      modelVersion: baselineProfile.modelVersion,
      modelDigest: newDigest,
      dimensions: baselineProfile.dimensions,
    });

    expect(result.hasChanged).toBe(true);
    expect(result.isMaterialChange).toBe(true);
    expect(result.candidateProfile.profileId).not.toBe(baselineProfile.profileId);
    expect(result.differences.some((d) => d.includes('Model digest changed'))).toBe(true);
  });

  it('detects material change when dimensions change', () => {
    const result = detector.detectModelChange(baselineProfile, {
      provider: baselineProfile.provider,
      modelName: 'bge-large',
      modelDigest: baselineProfile.modelDigest,
      dimensions: 768, // Changed from 1024
    });

    expect(result.hasChanged).toBe(true);
    expect(result.isMaterialChange).toBe(true);
    expect(result.candidateProfile.dimensions).toBe(768);
    expect(result.differences.some((d) => d.includes('Dimensions changed from 1024 to 768'))).toBe(
      true,
    );
  });

  it('detects material change when normalization policy changes', () => {
    const result = detector.detectModelChange(baselineProfile, {
      provider: baselineProfile.provider,
      modelName: baselineProfile.modelName,
      modelDigest: baselineProfile.modelDigest,
      dimensions: baselineProfile.dimensions,
      normalizationPolicy: NormalizationPolicy.NONE, // Changed from UNIT_L2
    });

    expect(result.hasChanged).toBe(true);
    expect(result.isMaterialChange).toBe(true);
    expect(result.candidateProfile.normalizationPolicy).toBe(NormalizationPolicy.NONE);
    expect(result.differences.some((d) => d.includes('Normalization policy changed'))).toBe(true);
  });

  it('detects material change when provider changes', () => {
    const result = detector.detectModelChange(baselineProfile, {
      provider: 'openai',
      modelName: 'text-embedding-3-small',
      modelDigest: 'openai-digest-hash',
      dimensions: 1536,
    });

    expect(result.hasChanged).toBe(true);
    expect(result.isMaterialChange).toBe(true);
    expect(result.differences.some((d) => d.includes('Provider changed'))).toBe(true);
  });

  it('preserves historical baseline profile without mutation', () => {
    const originalProfileId = baselineProfile.profileId;
    const originalDimensions = baselineProfile.dimensions;

    detector.detectModelChange(baselineProfile, {
      provider: baselineProfile.provider,
      modelName: baselineProfile.modelName,
      modelDigest: 'completely-different-digest',
      dimensions: 512,
    });

    // Baseline MUST be completely unmodified
    expect(baselineProfile.profileId).toBe(originalProfileId);
    expect(baselineProfile.dimensions).toBe(originalDimensions);
  });
});
