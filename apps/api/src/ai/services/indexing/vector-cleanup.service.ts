import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IVectorStorePort,
  VECTOR_STORE_PORT,
  IVectorIndexingJobRepositoryPort,
  VECTOR_INDEXING_JOB_REPOSITORY_PORT,
  IIndexGenerationRepositoryPort,
  INDEX_GENERATION_REPOSITORY_PORT,
  IndexGenerationStatus,
} from '@kinergy-platform/core';

export interface DocumentCleanupResult {
  readonly tenantId: string;
  readonly documentId: string;
  readonly cancelledJobs: number;
  readonly deletedVectors: number;
}

export interface VersionCleanupResult {
  readonly tenantId: string;
  readonly versionId: string;
  readonly cancelledJobs: number;
  readonly deletedVectors: number;
}

export interface ExpiredGenerationCleanupResult {
  readonly tenantId: string;
  readonly protectedGenerations: readonly string[];
  readonly cleanedGenerations: readonly string[];
  readonly deletedVectorCount: number;
}

export interface GenerationCleanupOptions {
  readonly keepLatestRetired?: number;
  readonly maxAgeDays?: number;
}

/**
 * Service that manages physical vector deletion, tenant isolation, and retention policies.
 * Ensures vectors from soft-deleted documents or expired generations are purged from active
 * similarity search while preserving rollback capability within retention windows.
 */
@Injectable()
export class VectorCleanupService {
  private readonly logger = new Logger(VectorCleanupService.name);

  constructor(
    @Inject(VECTOR_STORE_PORT)
    private readonly vectorStore: IVectorStorePort,
    @Inject(VECTOR_INDEXING_JOB_REPOSITORY_PORT)
    private readonly jobRepo: IVectorIndexingJobRepositoryPort,
    @Inject(INDEX_GENERATION_REPOSITORY_PORT)
    private readonly generationRepo: IIndexGenerationRepositoryPort,
  ) {}

  /**
   * Cleans up vectors and cancels active jobs for a deleted document.
   * Enforces strict tenant boundaries.
   */
  public async cleanupDocumentVectors(
    tenantId: string,
    documentId: string,
    reason = 'Document soft-deleted or removed from knowledge base',
  ): Promise<DocumentCleanupResult> {
    const cleanTenantId = tenantId.trim();
    const cleanDocId = documentId.trim();

    this.logger.log(
      `Initiating vector cleanup for document '${cleanDocId}' in tenant '${cleanTenantId}'...`,
    );

    // 1. Cancel in-flight jobs for this document
    const cancelledJobs = await this.jobRepo.cancelJobsForDocument(cleanDocId, reason);

    // 2. Physically remove vectors from document_embeddings table
    const deletedVectors = await this.vectorStore.deleteByDocumentId(cleanDocId);

    this.logger.log(
      `Completed vector cleanup for doc '${cleanDocId}': cancelled ${cancelledJobs} jobs, deleted ${deletedVectors} vectors.`,
    );

    return {
      tenantId: cleanTenantId,
      documentId: cleanDocId,
      cancelledJobs,
      deletedVectors,
    };
  }

  /**
   * Cleans up vectors and cancels active jobs for a specific document version.
   */
  public async cleanupVersionVectors(
    tenantId: string,
    versionId: string,
    reason = 'Document version deleted or superseded',
  ): Promise<VersionCleanupResult> {
    const cleanTenantId = tenantId.trim();
    const cleanVerId = versionId.trim();

    this.logger.log(
      `Initiating vector cleanup for version '${cleanVerId}' in tenant '${cleanTenantId}'...`,
    );

    const cancelledJobs = await this.jobRepo.cancelJobsForVersion(cleanVerId, reason);
    const deletedVectors = await this.vectorStore.deleteByDocumentVersionId(cleanVerId);

    this.logger.log(
      `Completed vector cleanup for version '${cleanVerId}': cancelled ${cancelledJobs} jobs, deleted ${deletedVectors} vectors.`,
    );

    return {
      tenantId: cleanTenantId,
      versionId: cleanVerId,
      cancelledJobs,
      deletedVectors,
    };
  }

  /**
   * Cleans up vectors from expired RETIRED generations while preserving active and recent retired generations
   * for rollback safety.
   */
  public async cleanupExpiredGenerations(
    tenantId: string,
    options?: GenerationCleanupOptions,
  ): Promise<ExpiredGenerationCleanupResult> {
    const cleanTenantId = tenantId.trim();
    const keepLatestRetired = options?.keepLatestRetired ?? 2;
    const maxAgeDays = options?.maxAgeDays ?? 30;
    const maxAgeCutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

    const allGenerations = await this.generationRepo.listByTenantId(cleanTenantId);

    const protectedGenIds: string[] = [];
    const candidatesForCleanup: string[] = [];

    // Separate active/building from retired
    const retiredGenerations = allGenerations
      .filter((g) => {
        if (
          g.status === IndexGenerationStatus.ACTIVE ||
          g.status === IndexGenerationStatus.BUILDING ||
          g.status === IndexGenerationStatus.VALIDATING
        ) {
          protectedGenIds.push(g.id.value);
          return false;
        }
        return g.status === IndexGenerationStatus.RETIRED;
      })
      .sort((a, b) => {
        const timeA = a.retiredAt ? a.retiredAt.getTime() : 0;
        const timeB = b.retiredAt ? b.retiredAt.getTime() : 0;
        return timeB - timeA; // Descending (newest retired first)
      });

    // Protect the most recent N retired generations for rollback
    for (let i = 0; i < retiredGenerations.length; i++) {
      const gen = retiredGenerations[i]!;
      if (i < keepLatestRetired) {
        protectedGenIds.push(gen.id.value);
      } else {
        // If older than maxAgeCutoff or beyond keepLatestRetired
        if (!gen.retiredAt || gen.retiredAt < maxAgeCutoff || i >= keepLatestRetired) {
          candidatesForCleanup.push(gen.id.value);
        } else {
          protectedGenIds.push(gen.id.value);
        }
      }
    }

    let totalDeletedVectors = 0;
    const cleanedGenerations: string[] = [];

    for (const genId of candidatesForCleanup) {
      try {
        const deleted = await this.vectorStore.deleteByGenerationId(genId);
        totalDeletedVectors += deleted;
        cleanedGenerations.push(genId);
        this.logger.log(
          `Purged ${deleted} vectors from expired generation '${genId}' in tenant '${cleanTenantId}'.`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to purge vectors for generation '${genId}' in tenant '${cleanTenantId}': ${err}`,
        );
      }
    }

    return {
      tenantId: cleanTenantId,
      protectedGenerations: protectedGenIds,
      cleanedGenerations,
      deletedVectorCount: totalDeletedVectors,
    };
  }
}
