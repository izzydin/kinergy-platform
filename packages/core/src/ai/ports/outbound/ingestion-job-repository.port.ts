import { IngestionJob } from '../../domain/models/ingestion-job.aggregate';
import { IngestionStatus } from '../../domain/enums/ingestion-status.enum';

export const INGESTION_JOB_REPOSITORY_PORT = Symbol('INGESTION_JOB_REPOSITORY_PORT');

export interface IngestionJobListFilter {
  status?: IngestionStatus;
  documentId?: string;
  documentVersionId?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'startedAt' | 'completedAt';
  orderDirection?: 'asc' | 'desc';
}

export interface PaginatedIngestionJobsResult {
  items: IngestionJob[];
  total: number;
}

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
   * Finds all historical ingestion jobs for a document across all versions.
   */
  findByDocumentId(tenantId: string, documentId: string): Promise<IngestionJob[]>;

  /**
   * Finds paginated ingestion jobs within a tenant matching query filters.
   */
  findAll(tenantId: string, filter?: IngestionJobListFilter): Promise<PaginatedIngestionJobsResult>;

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
