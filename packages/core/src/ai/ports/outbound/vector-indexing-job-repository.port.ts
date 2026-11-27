import {
  VectorIndexingJob,
  VectorIndexingScope,
} from '../../domain/models/vector-indexing-job.model';

export const VECTOR_INDEXING_JOB_REPOSITORY_PORT = Symbol('IVectorIndexingJobRepositoryPort');

/**
 * Outbound Port defining durable persistence and lifecycle management for VectorIndexingJob models.
 * Pure domain contract isolated from Prisma or SQL specifics.
 */
export interface IVectorIndexingJobRepositoryPort {
  /**
   * Persists or updates a VectorIndexingJob record.
   */
  save(job: VectorIndexingJob): Promise<VectorIndexingJob>;

  /**
   * Finds a vector indexing job by its unique identifier.
   */
  findById(id: string): Promise<VectorIndexingJob | null>;

  /**
   * Finds an active (PENDING or RUNNING) job for a specific scope and generation.
   * Used to enforce idempotency and prevent duplicate concurrent executions.
   */
  findActiveByScope(
    scope: VectorIndexingScope,
    scopeId: string,
    generationId: string,
  ): Promise<VectorIndexingJob | null>;

  /**
   * Atomically claims a PENDING job for processing, transitioning it to RUNNING
   * and incrementing the attempt count.
   * Returns the claimed job, or null if the job was already claimed or not in PENDING state.
   */
  claimJob(id: string): Promise<VectorIndexingJob | null>;

  /**
   * Lists jobs currently in RUNNING state whose startedAt timestamp is older than staleBefore.
   * Used for stale worker lease reconciliation.
   */
  listStaleJobs(staleBefore: Date, limit?: number): Promise<VectorIndexingJob[]>;

  /**
   * Lists all indexing jobs associated with a generation.
   */
  listByGenerationId(generationId: string): Promise<VectorIndexingJob[]>;

  /**
   * Cancels in-flight (PENDING/RUNNING) indexing jobs for a deleted document.
   */
  cancelJobsForDocument(documentId: string, reason: string, tenantId?: string): Promise<number>;

  /**
   * Cancels in-flight (PENDING/RUNNING) indexing jobs for a deleted document version.
   */
  cancelJobsForVersion(versionId: string, reason: string, tenantId?: string): Promise<number>;
}
