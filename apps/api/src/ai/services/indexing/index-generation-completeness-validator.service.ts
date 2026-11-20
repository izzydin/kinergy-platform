import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IIndexGenerationRepositoryPort,
  INDEX_GENERATION_REPOSITORY_PORT,
  IVectorStorePort,
  VECTOR_STORE_PORT,
  IVectorIndexingJobRepositoryPort,
  VECTOR_INDEXING_JOB_REPOSITORY_PORT,
  IndexGenerationStatus,
  VectorIndexingJobStatus,
  IncompleteIndexGenerationException,
  IndexGenerationNotFoundException,
} from '@kinergy-platform/core';
import { PrismaService } from '../../../platform/persistence/prisma/prisma.service';

export interface GenerationCompletenessResult {
  readonly isValid: boolean;
  readonly generationId: string;
  readonly tenantId: string;
  readonly targetChunkCount: number;
  readonly indexedChunkCount: number;
  readonly actualPersistedCount: number;
  readonly failedChunkCount: number;
  readonly discrepancies: readonly string[];
}

/**
 * Service that enforces strict completeness verification before any IndexGeneration
 * can be transitioned to VALIDATING or promoted to ACTIVE.
 *
 * Invariant: Incomplete, corrupted, or partially failed generations MUST NEVER be activated.
 */
@Injectable()
export class IndexGenerationCompletenessValidatorService {
  private readonly logger = new Logger(IndexGenerationCompletenessValidatorService.name);

  constructor(
    @Inject(INDEX_GENERATION_REPOSITORY_PORT)
    private readonly generationRepo: IIndexGenerationRepositoryPort,
    @Inject(VECTOR_STORE_PORT)
    private readonly vectorStore: IVectorStorePort,
    @Inject(VECTOR_INDEXING_JOB_REPOSITORY_PORT)
    private readonly indexingJobRepo: IVectorIndexingJobRepositoryPort,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Performs an exhaustive completeness audit on an index generation.
   */
  public async validate(generationId: string): Promise<GenerationCompletenessResult> {
    const cleanId = generationId.trim();
    const generation = await this.generationRepo.findById(cleanId);

    if (!generation) {
      throw new IndexGenerationNotFoundException(cleanId);
    }

    const discrepancies: string[] = [];

    // 1. Status Check: Generation cannot be in terminal failed or cancelled state
    if (
      generation.status === IndexGenerationStatus.FAILED ||
      generation.status === IndexGenerationStatus.CANCELLED ||
      generation.status === IndexGenerationStatus.RETIRED
    ) {
      discrepancies.push(
        `Generation is in invalid status '${generation.status}' for completeness validation.`,
      );
    }

    // 2. Target and Count Accounting
    if (generation.targetChunkCount <= 0) {
      discrepancies.push(
        `Target chunk count must be greater than 0, received ${generation.targetChunkCount}.`,
      );
    }

    if (generation.indexedChunkCount <= 0) {
      discrepancies.push(
        `Indexed chunk count must be greater than 0, received ${generation.indexedChunkCount}.`,
      );
    }

    const accountedChunks = generation.indexedChunkCount + generation.failedChunkCount;
    if (accountedChunks < generation.targetChunkCount) {
      discrepancies.push(
        `Accounted chunks (${accountedChunks}) are less than targetChunkCount (${generation.targetChunkCount}). Missing ${generation.targetChunkCount - accountedChunks} chunks.`,
      );
    }

    // 3. Permanent Failure Policy: Generation cannot activate with unresolved failed chunks
    if (generation.failedChunkCount > 0) {
      discrepancies.push(
        `Generation contains ${generation.failedChunkCount} unresolved failed chunks. All required chunks must be successfully indexed.`,
      );
    }

    // 4. Actual Database Row Reconciliation
    const actualPersistedCount = await this.vectorStore.countByGenerationId(cleanId);
    if (actualPersistedCount !== generation.indexedChunkCount) {
      discrepancies.push(
        `Persisted vector rows in database (${actualPersistedCount}) do not match generation indexedChunkCount (${generation.indexedChunkCount}).`,
      );
    }

    // 5. Vector Dimension, Profile & Fingerprint Integrity Audit
    const rawAudit = await this.prisma.$queryRawUnsafe<Array<{ invalid_count: string | number }>>(
      `SELECT COUNT(*)::int AS "invalid_count"
       FROM "document_embeddings"
       WHERE "index_generation_id" = $1
         AND (
           "dimensions" != $2
           OR "profile_id" != $3
           OR length("content_fingerprint") != 64
         );`,
      cleanId,
      generation.profile.dimensions,
      generation.profile.profileId,
    );

    const invalidVectorCount = rawAudit && rawAudit[0] ? Number(rawAudit[0].invalid_count) : 0;
    if (invalidVectorCount > 0) {
      discrepancies.push(
        `${invalidVectorCount} persisted embeddings violate profile specifications (dimension, profile ID, or fingerprint length).`,
      );
    }

    // 6. Outstanding / In-Progress Job Audit
    const jobs = await this.indexingJobRepo.listByGenerationId(cleanId);
    const pendingOrRunningJobs = jobs.filter(
      (j) =>
        j.status === VectorIndexingJobStatus.PENDING ||
        j.status === VectorIndexingJobStatus.RUNNING,
    );
    if (pendingOrRunningJobs.length > 0) {
      discrepancies.push(
        `${pendingOrRunningJobs.length} indexing jobs are still in PENDING or RUNNING status.`,
      );
    }

    const failedJobs = jobs.filter((j) => j.status === VectorIndexingJobStatus.FAILED);
    if (failedJobs.length > 0) {
      discrepancies.push(
        `${failedJobs.length} indexing jobs ended in FAILED status without successful retry.`,
      );
    }

    const isValid = discrepancies.length === 0;

    if (!isValid) {
      this.logger.warn(
        `Generation '${cleanId}' failed completeness validation with ${discrepancies.length} discrepancies: ${discrepancies.join('; ')}`,
      );
    } else {
      this.logger.log(
        `Generation '${cleanId}' passed completeness validation: ${actualPersistedCount}/${generation.targetChunkCount} chunks verified.`,
      );
    }

    return {
      isValid,
      generationId: cleanId,
      tenantId: generation.tenantId,
      targetChunkCount: generation.targetChunkCount,
      indexedChunkCount: generation.indexedChunkCount,
      actualPersistedCount,
      failedChunkCount: generation.failedChunkCount,
      discrepancies,
    };
  }

  /**
   * Asserts that a generation is strictly complete; throws IncompleteIndexGenerationException if not.
   */
  public async assertComplete(generationId: string): Promise<GenerationCompletenessResult> {
    const result = await this.validate(generationId);
    if (!result.isValid) {
      throw new IncompleteIndexGenerationException(generationId, result.discrepancies);
    }
    return result;
  }
}
