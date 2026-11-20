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
