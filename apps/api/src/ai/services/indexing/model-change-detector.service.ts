import { Injectable, Logger } from '@nestjs/common';
import {
  EmbeddingProfile,
  NormalizationPolicy,
  PoolingStrategy,
  EmbeddingType,
} from '@kinergy-platform/core';

export interface ModelMetadataInput {
  readonly provider: string;
  readonly modelName: string;
  readonly modelVersion?: string;
  readonly modelDigest: string;
  readonly dimensions: number;
  readonly tokenizerIdentity?: string;
  readonly normalizationPolicy?: NormalizationPolicy;
  readonly poolingStrategy?: PoolingStrategy;
  readonly embeddingType?: EmbeddingType;
}

export interface ModelChangeDetectionResult {
  readonly hasChanged: boolean;
  readonly isMaterialChange: boolean;
  readonly differences: readonly string[];
  readonly candidateProfile: EmbeddingProfile;
}

/**
 * Service that detects material changes between an existing active EmbeddingProfile
 * and candidate/runtime model metadata.
 *
 * Invariant: Changing a model, digest, dimensionality, or normalization policy produces
 * a new immutable profile identity and NEVER mutates historical profiles.
 */
@Injectable()
export class ModelChangeDetectorService {
  private readonly logger = new Logger(ModelChangeDetectorService.name);

  /**
   * Evaluates candidate metadata against an existing baseline profile.
   */
  public detectModelChange(
    baseline: EmbeddingProfile,
    candidateMeta: ModelMetadataInput,
  ): ModelChangeDetectionResult {
    const candidateProfile = EmbeddingProfile.create({
      provider: candidateMeta.provider,
      modelName: candidateMeta.modelName,
      modelVersion: candidateMeta.modelVersion || 'latest',
      modelDigest: candidateMeta.modelDigest,
      dimensions: candidateMeta.dimensions,
      tokenizerIdentity: candidateMeta.tokenizerIdentity || baseline.tokenizerIdentity,
      normalizationPolicy: candidateMeta.normalizationPolicy || baseline.normalizationPolicy,
      poolingStrategy: candidateMeta.poolingStrategy || baseline.poolingStrategy,
      embeddingType: candidateMeta.embeddingType || baseline.embeddingType,
    });

    const differences: string[] = [];

    if (baseline.profileId === candidateProfile.profileId) {
      return {
        hasChanged: false,
        isMaterialChange: false,
        differences: [],
        candidateProfile,
      };
    }

    if (baseline.provider !== candidateProfile.provider) {
      differences.push(
        `Provider changed from '${baseline.provider}' to '${candidateProfile.provider}'`,
      );
    }
    if (baseline.modelName !== candidateProfile.modelName) {
      differences.push(
        `Model name changed from '${baseline.modelName}' to '${candidateProfile.modelName}'`,
      );
    }
    if (baseline.modelVersion !== candidateProfile.modelVersion) {
      differences.push(
        `Model version changed from '${baseline.modelVersion}' to '${candidateProfile.modelVersion}'`,
      );
    }
    if (baseline.modelDigest !== candidateProfile.modelDigest) {
      differences.push(
        `Model digest changed from '${baseline.modelDigest.substring(0, 16)}...' to '${candidateProfile.modelDigest.substring(0, 16)}...'`,
      );
    }
    if (baseline.dimensions !== candidateProfile.dimensions) {
      differences.push(
        `Dimensions changed from ${baseline.dimensions} to ${candidateProfile.dimensions}`,
      );
    }
    if (baseline.normalizationPolicy !== candidateProfile.normalizationPolicy) {
      differences.push(
        `Normalization policy changed from '${baseline.normalizationPolicy}' to '${candidateProfile.normalizationPolicy}'`,
      );
    }
    if (baseline.poolingStrategy !== candidateProfile.poolingStrategy) {
      differences.push(
        `Pooling strategy changed from '${baseline.poolingStrategy}' to '${candidateProfile.poolingStrategy}'`,
      );
    }

    const isMaterialChange = differences.length > 0;

    if (isMaterialChange) {
      this.logger.log(
        `Detected material model change (${differences.length} differences). Candidate profile derived: '${candidateProfile.profileId}'`,
      );
    }

    return {
      hasChanged: isMaterialChange,
      isMaterialChange,
      differences,
      candidateProfile,
    };
  }
}
