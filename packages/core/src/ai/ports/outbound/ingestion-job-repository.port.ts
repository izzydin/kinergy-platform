import { IngestionJob } from '../../domain/models/ingestion-job.aggregate';

export const INGESTION_JOB_REPOSITORY_PORT = Symbol('INGESTION_JOB_REPOSITORY_PORT');

/**
 * Port contract for IngestionJob persistence.
 * Pure TypeScript interface decoupled from database technologies.
 */
export interface IIngestionJobRepositoryPort {
  /**
   * Persists or updates an IngestionJob aggregate root atomically.
   */
  save(job: IngestionJob): Promise<IngestionJob>;

  /**
   * Finds an ingestion job by ID within a tenant boundary.
   */
  findById(tenantId: string, id: string): Promise<IngestionJob | null>;

  /**
   * Finds all historical ingestion jobs for a specific document version.
   */
  findByVersionId(tenantId: string, versionId: string): Promise<IngestionJob[]>;

  /**
   * Finds any currently active ingestion job for a version (UPLOADED, VALIDATING, PROCESSING, INDEXING).
   */
  findActiveJobByVersionId(tenantId: string, versionId: string): Promise<IngestionJob | null>;

  /**
   * Retrieves jobs eligible for retry across tenants (for background worker polling).
   */
  findPendingRetries(limit?: number): Promise<IngestionJob[]>;

  /**
   * Retrieves jobs currently in UPLOADED status awaiting initial processing.
   */
  findPendingUploads(limit?: number): Promise<IngestionJob[]>;

  /**
   * Retrieves active jobs (VALIDATING, PROCESSING, INDEXING) that have been stalled
   * longer than the specified threshold, indicating a crashed or disrupted worker.
   */
  findStaleActiveJobs(olderThan: Date, limit?: number): Promise<IngestionJob[]>;
}
