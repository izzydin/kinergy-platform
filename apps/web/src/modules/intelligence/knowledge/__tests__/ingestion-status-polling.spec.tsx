import '@testing-library/jest-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  getIngestionJobsPollingInterval,
  getRetrievalStatusPollingInterval,
  getDocumentDetailPollingInterval,
  shouldRetryIngestionQuery,
  getIngestionQueryRetryDelay,
  isIngestionInFlight,
  DEFAULT_INGESTION_POLLING_CONFIG,
} from '../hooks/ingestion-polling.policy';
import {
  useDocumentIngestionHistory,
  useDocumentRetrievalStatus,
} from '../hooks/use-knowledge-queries';
import { knowledgeApi } from '../api/knowledge.api';
import type {
  IngestionJobItem,
  IngestionRetrievalStatus,
  KnowledgeDocumentItem,
} from '../types/knowledge-contract.types';

jest.mock('../api/knowledge.api');
const mockedKnowledgeApi = knowledgeApi as jest.Mocked<typeof knowledgeApi>;

describe('IM.06 — Ingestion Status Refresh & Polling Policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. In-flight State Detection
  // =========================================================================
  describe('isIngestionInFlight', () => {
    it('identifies in-flight states correctly', () => {
      expect(isIngestionInFlight('UPLOADED')).toBe(true);
      expect(isIngestionInFlight('VALIDATING')).toBe(true);
      expect(isIngestionInFlight('PROCESSING')).toBe(true);
      expect(isIngestionInFlight('INDEXING')).toBe(true);
    });

    it('identifies terminal and null states as not in-flight', () => {
      expect(isIngestionInFlight('READY')).toBe(false);
      expect(isIngestionInFlight('FAILED')).toBe(false);
      expect(isIngestionInFlight('CANCELLED')).toBe(false);
      expect(isIngestionInFlight(null)).toBe(false);
      expect(isIngestionInFlight(undefined)).toBe(false);
    });
  });

  // =========================================================================
  // 2. Job Polling Interval Calculation
  // =========================================================================
  describe('getIngestionJobsPollingInterval', () => {
    const createJob = (
      id: string,
      status: IngestionJobItem['status'],
      createdAt: string,
      nextRetryAt?: string | null,
    ): IngestionJobItem => ({
      id,
      documentId: 'doc_1',
      documentVersionId: 'ver_1',
      status,
      attemptCount: 1,
      maxAttempts: 3,
      createdAt,
      nextRetryAt,
    });

    it('returns 3000ms when the latest job is in-flight (PROCESSING)', () => {
      const jobs = [createJob('job_1', 'PROCESSING', '2026-11-26T10:00:00.000Z')];
      const interval = getIngestionJobsPollingInterval(jobs);
      expect(interval).toBe(3000);
    });

    it('returns 3000ms when the latest job is INDEXING or VALIDATING', () => {
      const jobs = [createJob('job_1', 'INDEXING', '2026-11-26T10:00:00.000Z')];
      expect(getIngestionJobsPollingInterval(jobs)).toBe(3000);

      const jobsVal = [createJob('job_2', 'VALIDATING', '2026-11-26T10:00:00.000Z')];
      expect(getIngestionJobsPollingInterval(jobsVal)).toBe(3000);
    });

    it('returns false (stops polling) when the latest job is READY', () => {
      const jobs = [createJob('job_1', 'READY', '2026-11-26T10:00:00.000Z')];
      const interval = getIngestionJobsPollingInterval(jobs);
      expect(interval).toBe(false);
    });

    it('returns false (stops polling) when the latest job is CANCELLED', () => {
      const jobs = [createJob('job_1', 'CANCELLED', '2026-11-26T10:00:00.000Z')];
      expect(getIngestionJobsPollingInterval(jobs)).toBe(false);
    });

    it('returns false when latest job is FAILED without scheduled retry', () => {
      const jobs = [createJob('job_1', 'FAILED', '2026-11-26T10:00:00.000Z', null)];
      expect(getIngestionJobsPollingInterval(jobs)).toBe(false);
    });

    it('returns scheduledRetryIntervalMs (5000ms) when latest job is FAILED with future retry scheduled', () => {
      const futureRetry = new Date(Date.now() + 60000).toISOString();
      const jobs = [createJob('job_1', 'FAILED', '2026-11-26T10:00:00.000Z', futureRetry)];
      const interval = getIngestionJobsPollingInterval(jobs);
      expect(interval).toBe(5000);
    });

    it('sorts jobs descending by createdAt so latest attempt dictates interval', () => {
      const olderJob = createJob('job_old', 'PROCESSING', '2026-11-26T09:00:00.000Z');
      const newerJob = createJob('job_new', 'READY', '2026-11-26T10:00:00.000Z');
      // Passed in arbitrary order
      const interval = getIngestionJobsPollingInterval([olderJob, newerJob]);
      expect(interval).toBe(false);
    });

    it('returns false for empty or undefined job arrays', () => {
      expect(getIngestionJobsPollingInterval([])).toBe(false);
      expect(getIngestionJobsPollingInterval(undefined)).toBe(false);
      expect(getIngestionJobsPollingInterval(null)).toBe(false);
    });
  });

  // =========================================================================
  // 3. Retrieval Status Polling Interval Calculation
  // =========================================================================
  describe('getRetrievalStatusPollingInterval', () => {
    it('returns false when retrieval status is fully ready and consistent', () => {
      const status: IngestionRetrievalStatus = {
        isReadyForRetrieval: true,
        hasVersionDiscrepancy: false,
      };
      expect(getRetrievalStatusPollingInterval(status)).toBe(false);
    });

    it('returns 4000ms when version discrepancy indicates current version is processing', () => {
      const status: IngestionRetrievalStatus = {
        isReadyForRetrieval: true,
        hasVersionDiscrepancy: true,
        discrepancyReason:
          'La versión actual (v2) está siendo procesada. La versión anterior permanece activa.',
      };
      expect(getRetrievalStatusPollingInterval(status)).toBe(4000);
    });

    it('returns false when version discrepancy is terminal (e.g. current version failed)', () => {
      const status: IngestionRetrievalStatus = {
        isReadyForRetrieval: true,
        hasVersionDiscrepancy: true,
        discrepancyReason:
          'La indexación de la versión actual falló. La versión anterior continúa activa.',
      };
      expect(getRetrievalStatusPollingInterval(status)).toBe(false);
    });

    it('returns false when document is soft-deleted or non-existent', () => {
      const statusDeleted: IngestionRetrievalStatus = {
        isReadyForRetrieval: false,
        reason: 'Document has been soft-deleted and is excluded from semantic search.',
      };
      expect(getRetrievalStatusPollingInterval(statusDeleted)).toBe(false);

      const statusNotFound: IngestionRetrievalStatus = {
        isReadyForRetrieval: false,
        reason: "Document 'doc_missing' does not exist.",
      };
      expect(getRetrievalStatusPollingInterval(statusNotFound)).toBe(false);
    });

    it('returns 4000ms when retrieval status is not ready due to in progress pipeline', () => {
      const statusInProgress: IngestionRetrievalStatus = {
        isReadyForRetrieval: false,
        reason: 'Latest ingestion job is in progress.',
      };
      expect(getRetrievalStatusPollingInterval(statusInProgress)).toBe(4000);
    });
  });

  // =========================================================================
  // 4. Document Detail Polling Interval
  // =========================================================================
  describe('getDocumentDetailPollingInterval', () => {
    const baseDoc: KnowledgeDocumentItem = {
      id: 'doc_1',
      title: 'Doc 1',
      visibilityScope: 'ALL_STAFF',
      currentVersionId: 'v1',
      uploadedBy: 'user',
      createdAt: '2026-11-26T10:00:00.000Z',
      updatedAt: '2026-11-26T10:00:00.000Z',
      versions: [],
      isDeleted: false,
    };

    it('returns 4000ms when document ingestionStatus is in-flight', () => {
      expect(
        getDocumentDetailPollingInterval({
          ...baseDoc,
          ingestionStatus: 'PROCESSING',
        }),
      ).toBe(4000);
      expect(
        getDocumentDetailPollingInterval({
          ...baseDoc,
          ingestionStatus: 'INDEXING',
        }),
      ).toBe(4000);
    });

    it('returns false when document is terminal or soft-deleted', () => {
      expect(
        getDocumentDetailPollingInterval({
          ...baseDoc,
          ingestionStatus: 'READY',
        }),
      ).toBe(false);
      expect(
        getDocumentDetailPollingInterval({
          ...baseDoc,
          isDeleted: true,
          ingestionStatus: 'PROCESSING',
        }),
      ).toBe(false);
    });
  });

  // =========================================================================
  // 5. Bounded Query Retry & Error Category Discrimination
  // =========================================================================
  describe('shouldRetryIngestionQuery & getIngestionQueryRetryDelay', () => {
    it('halts retry immediately on HTTP 401 Unauthorized', () => {
      const error = { statusCode: 401, message: 'Unauthorized' };
      expect(shouldRetryIngestionQuery(0, error)).toBe(false);
    });

    it('halts retry immediately on HTTP 403 Forbidden', () => {
      const error = { statusCode: 403, message: 'Forbidden' };
      expect(shouldRetryIngestionQuery(0, error)).toBe(false);
    });

    it('halts retry immediately on HTTP 404 Not Found', () => {
      const error = { statusCode: 404, message: 'Document Not Found' };
      expect(shouldRetryIngestionQuery(0, error)).toBe(false);
    });

    it('allows retry up to maxRetries on transient 5xx or network errors', () => {
      const networkError = { statusCode: 503, message: 'Service Unavailable' };
      expect(shouldRetryIngestionQuery(0, networkError)).toBe(true);
      expect(shouldRetryIngestionQuery(1, networkError)).toBe(true);
      expect(shouldRetryIngestionQuery(2, networkError)).toBe(true);
      expect(shouldRetryIngestionQuery(3, networkError)).toBe(false);
    });

    it('calculates bounded exponential backoff delay', () => {
      expect(getIngestionQueryRetryDelay(0)).toBe(1000);
      expect(getIngestionQueryRetryDelay(1)).toBe(2000);
      expect(getIngestionQueryRetryDelay(2)).toBe(4000);
      expect(getIngestionQueryRetryDelay(3)).toBe(8000);
      expect(getIngestionQueryRetryDelay(4)).toBe(DEFAULT_INGESTION_POLLING_CONFIG.maxRetryDelayMs);
    });
  });

  // =========================================================================
  // 6. Hook Level Integration & Request Deduplication
  // =========================================================================
  describe('TanStack Query Hook Polling Integration', () => {
    function createWrapper() {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
          },
        },
      });
      return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }

    it('fetches ingestion history and handles empty/ready responses without polling', async () => {
      mockedKnowledgeApi.getIngestionHistory.mockResolvedValueOnce([
        {
          id: 'job_done',
          documentId: 'doc_1',
          documentVersionId: 'ver_1',
          status: 'READY',
          attemptCount: 1,
          maxAttempts: 3,
          createdAt: '2026-11-26T10:00:00.000Z',
        },
      ]);

      const { result } = renderHook(() => useDocumentIngestionHistory('doc_1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0]?.status).toBe('READY');
      expect(mockedKnowledgeApi.getIngestionHistory).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent hook invocations for the same documentId', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 10000 } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      mockedKnowledgeApi.getRetrievalStatus.mockResolvedValue({
        isReadyForRetrieval: true,
        hasVersionDiscrepancy: false,
        totalChunks: 10,
        indexedChunks: 10,
        embeddingsCount: 10,
        reason: 'Ready',
      });

      // Render two independent hooks targeting the same documentId
      const { result: hook1 } = renderHook(() => useDocumentRetrievalStatus('doc_dedup'), {
        wrapper,
      });
      const { result: hook2 } = renderHook(() => useDocumentRetrievalStatus('doc_dedup'), {
        wrapper,
      });

      await waitFor(() => expect(hook1.current.isSuccess).toBe(true));
      await waitFor(() => expect(hook2.current.isSuccess).toBe(true));

      // Query should be deduplicated: exactly 1 network call
      expect(mockedKnowledgeApi.getRetrievalStatus).toHaveBeenCalledTimes(1);
      expect(hook1.current.data?.isReadyForRetrieval).toBe(true);
      expect(hook2.current.data?.isReadyForRetrieval).toBe(true);
    });
  });
});
