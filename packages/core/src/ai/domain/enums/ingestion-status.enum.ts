/**
 * Explicit lifecycle status enum for document ingestion jobs.
 * Conforms to Milestone AI-03 specification.
 */
export enum IngestionStatus {
  UPLOADED = 'UPLOADED',
  VALIDATING = 'VALIDATING',
  PROCESSING = 'PROCESSING',
  INDEXING = 'INDEXING',
  READY = 'READY',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Stage identifiers for fine-grained ingestion observability.
 */
export enum IngestionStageId {
  VALIDATING = 'VALIDATING',
  PROCESSING = 'PROCESSING',
  INDEXING = 'INDEXING',
}

/**
 * Discrete lifecycle status for an individual ingestion stage.
 */
export enum IngestionStageStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  SKIPPED = 'SKIPPED',
}

/**
 * Safe high-level failure category for administrative diagnostics.
 */
export enum IngestionFailureCategory {
  VALIDATION = 'VALIDATION',
  PARSING = 'PARSING',
  CHUNKING = 'CHUNKING',
  INDEXING = 'INDEXING',
  STORAGE = 'STORAGE',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  TIMEOUT = 'TIMEOUT',
  CANCELLATION = 'CANCELLATION',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Checks whether an ingestion status is in a terminal state (cannot transition further).
 */
export function isTerminalIngestionStatus(status: IngestionStatus): boolean {
  return status === IngestionStatus.READY || status === IngestionStatus.CANCELLED;
}

/**
 * Checks whether an ingestion status represents active processing.
 */
export function isIngestionActive(status: IngestionStatus): boolean {
  return (
    status === IngestionStatus.UPLOADED ||
    status === IngestionStatus.VALIDATING ||
    status === IngestionStatus.PROCESSING ||
    status === IngestionStatus.INDEXING
  );
}
