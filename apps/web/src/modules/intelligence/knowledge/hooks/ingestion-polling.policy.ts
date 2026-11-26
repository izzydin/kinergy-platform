/**
 * Ingestion Status Refresh & Polling Policy (IM.06)
 *
 * Centralizes polling intervals, terminal state detection, retry backoff,
 * and request deduplication policies for asynchronous document ingestion and indexing monitoring.
 */

import type {
  IngestionJobItem,
  IngestionRetrievalStatus,
  KnowledgeDocumentItem,
  IngestionStatus,
} from '../types/knowledge-contract.types';

export interface IngestionPollingPolicyConfig {
  readonly activeIntervalMs: number;
  readonly scheduledRetryIntervalMs: number;
  readonly documentDetailIntervalMs: number;
  readonly maxNetworkRetries: number;
  readonly maxRetryDelayMs: number;
}

export const DEFAULT_INGESTION_POLLING_CONFIG: IngestionPollingPolicyConfig = {
  activeIntervalMs: 3000,
  scheduledRetryIntervalMs: 5000,
  documentDetailIntervalMs: 4000,
  maxNetworkRetries: 3,
  maxRetryDelayMs: 10000,
};

const IN_FLIGHT_STATUSES: ReadonlySet<IngestionStatus> = new Set([
  'UPLOADED',
  'VALIDATING',
  'PROCESSING',
  'INDEXING',
]);

/**
 * Determines whether an ingestion job status represents an active, non-terminal pipeline execution.
 */
export function isIngestionInFlight(status?: IngestionStatus | null): boolean {
  if (!status) return false;
  return IN_FLIGHT_STATUSES.has(status);
}

/**
 * Determines whether an error is an unrecoverable client/auth error where polling should immediately halt.
 */
export function isTerminalQueryError(error: unknown): boolean {
  if (!error) return false;
  const errObj = error as { statusCode?: number; status?: number } | null | undefined;
  const status = errObj?.statusCode ?? errObj?.status;
  return status === 401 || status === 403 || status === 404;
}

/**
 * Determines whether an error is an HTTP 429 Too Many Requests response.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;
  const errObj = error as { statusCode?: number; status?: number } | null | undefined;
  const status = errObj?.statusCode ?? errObj?.status;
  return status === 429;
}

/**
 * Determines the TanStack Query refetch interval for document ingestion job history.
 *
 * Rules:
 * - Unrecoverable error (401, 403, 404): `false` (halt polling).
 * - Active / In-flight status (UPLOADED, VALIDATING, PROCESSING, INDEXING): 3000ms.
 * - FAILED with scheduled retry (`nextRetryAt`):
 *     - If in the future: 5000ms (to check near retry time).
 *     - If due or in the past: 3000ms (actively awaiting worker pickup).
 * - Terminal states (READY, CANCELLED, or FAILED without retry): `false` (halt polling).
 * - Empty or missing history: `false`.
 */
export function getIngestionJobsPollingInterval(
  jobs: readonly IngestionJobItem[] | undefined | null,
  config: IngestionPollingPolicyConfig = DEFAULT_INGESTION_POLLING_CONFIG,
  error?: unknown,
): number | false {
  if (isTerminalQueryError(error)) return false;
  if (!jobs || jobs.length === 0) return false;

  // Evaluate newest job attempt
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latest = sorted[0];
  if (!latest) return false;

  if (isIngestionInFlight(latest.status)) {
    return config.activeIntervalMs;
  }

  // If failed with a scheduled retry, continue polling until retry occurs
  if (latest.status === 'FAILED' && latest.nextRetryAt) {
    const nextRetryTime = new Date(latest.nextRetryAt).getTime();
    if (!isNaN(nextRetryTime)) {
      const now = Date.now();
      if (nextRetryTime > now) {
        return config.scheduledRetryIntervalMs;
      }
      return config.activeIntervalMs;
    }
  }

  // All terminal states without scheduled retry: halt polling
  return false;
}

/**
 * Determines the TanStack Query refetch interval for retrieval readiness status.
 *
 * Rules:
 * - Unrecoverable error (401, 403, 404): `false` (halt polling).
 * - Ready for retrieval and no active discrepancy: `false` (halt polling).
 * - Version discrepancy exists and current version is in-flight: 4000ms.
 * - Version discrepancy exists but current version failed or terminal: `false`.
 * - Not ready for retrieval:
 *     - If soft-deleted or unrecoverable error: `false`.
 *     - If reason suggests ongoing indexing or pending chunks: 4000ms.
 */
export function getRetrievalStatusPollingInterval(
  status: IngestionRetrievalStatus | undefined | null,
  config: IngestionPollingPolicyConfig = DEFAULT_INGESTION_POLLING_CONFIG,
  error?: unknown,
): number | false {
  if (isTerminalQueryError(error)) return false;
  if (!status) return false;

  // Fully indexed and no discrepancy: halt polling
  if (status.isReadyForRetrieval && !status.hasVersionDiscrepancy) {
    return false;
  }

  // Version discrepancy: check if discrepancy is due to in-flight processing
  if (status.hasVersionDiscrepancy) {
    const reason = (status.discrepancyReason || '').toLowerCase();
    const isInFlightDiscrepancy =
      reason.includes('procesada') ||
      reason.includes('proceso') ||
      reason.includes('cola') ||
      reason.includes('validando') ||
      reason.includes('indexando');

    if (isInFlightDiscrepancy) {
      return config.documentDetailIntervalMs;
    }
    // Terminal discrepancy (e.g. current version failed): do not poll indefinitely
    return false;
  }

  // Not ready for retrieval: check if it's due to active pipeline
  const reasonText = (status.reason || '').toLowerCase();
  if (
    reasonText.includes('soft-deleted') ||
    reasonText.includes('eliminado') ||
    reasonText.includes('does not exist') ||
    reasonText.includes('no existe')
  ) {
    return false;
  }

  if (
    reasonText.includes('in progress') ||
    reasonText.includes('en proceso') ||
    reasonText.includes('not ready') ||
    reasonText.includes('no está listo')
  ) {
    return config.documentDetailIntervalMs;
  }

  return false;
}

/**
 * Determines the TanStack Query refetch interval for a Knowledge Document item.
 *
 * Rules:
 * - Unrecoverable error (401, 403, 404): `false` (halt polling).
 * - If deleted or not found: `false`.
 * - If document.ingestionStatus is in-flight: 4000ms.
 * - If terminal (READY, FAILED, CANCELLED): `false`.
 */
export function getDocumentDetailPollingInterval(
  document: KnowledgeDocumentItem | undefined | null,
  config: IngestionPollingPolicyConfig = DEFAULT_INGESTION_POLLING_CONFIG,
  error?: unknown,
): number | false {
  if (isTerminalQueryError(error)) return false;
  if (!document || document.isDeleted) return false;

  if (isIngestionInFlight(document.ingestionStatus)) {
    return config.documentDetailIntervalMs;
  }

  return false;
}

/**
 * Determines whether a failed API query should be retried by TanStack Query.
 *
 * Rules:
 * - Terminal client/auth errors (HTTP 401 Unauthorized, 403 Forbidden, 404 Not Found): `false`
 * - Rate limiting (HTTP 429): retry up to maxNetworkRetries
 * - Transient network or 5xx server errors: retry up to maxNetworkRetries (default 3)
 */
export function shouldRetryIngestionQuery(
  failureCount: number,
  error: unknown,
  maxRetries = DEFAULT_INGESTION_POLLING_CONFIG.maxNetworkRetries,
): boolean {
  if (failureCount >= maxRetries) {
    return false;
  }

  if (isTerminalQueryError(error)) {
    return false;
  }

  return true;
}

/**
 * Calculates exponential backoff delay with upper bound for retrying failed API queries.
 * For rate limit responses (429), applies a higher base backoff to give upstream API time to recover.
 */
export function getIngestionQueryRetryDelay(
  attemptIndex: number,
  error?: unknown,
  maxDelayMs = DEFAULT_INGESTION_POLLING_CONFIG.maxRetryDelayMs,
): number {
  if (isRateLimitError(error)) {
    return Math.min(5000 * Math.pow(1.5, attemptIndex), maxDelayMs);
  }
  return Math.min(1000 * Math.pow(2, attemptIndex), maxDelayMs);
}
