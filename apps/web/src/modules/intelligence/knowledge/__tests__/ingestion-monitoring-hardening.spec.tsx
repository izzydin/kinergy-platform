import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  isTerminalQueryError,
  isRateLimitError,
  getIngestionJobsPollingInterval,
  getRetrievalStatusPollingInterval,
  getDocumentDetailPollingInterval,
  shouldRetryIngestionQuery,
  getIngestionQueryRetryDelay,
} from '../hooks/ingestion-polling.policy';
import { ProcessingHistoryDiagnostics } from '../components/processing-history-diagnostics';
import { IngestionLifecycleTimeline } from '../components/ingestion-lifecycle-timeline';
import type {
  IngestionJobItem,
  IngestionRetrievalStatus,
  KnowledgeDocumentItem,
} from '../types/knowledge-contract.types';

describe('IM.08 — Ingestion Monitoring Resilience, Security & UX Hardening', () => {
  // =========================================================================
  // 1. Polling & API Resilience Hardening
  // =========================================================================
  describe('Polling & API resilience policy', () => {
    it('identifies terminal client/auth errors (401, 403, 404)', () => {
      expect(isTerminalQueryError({ statusCode: 401 })).toBe(true);
      expect(isTerminalQueryError({ status: 403 })).toBe(true);
      expect(isTerminalQueryError({ statusCode: 404 })).toBe(true);
      expect(isTerminalQueryError({ statusCode: 500 })).toBe(false);
      expect(isTerminalQueryError({ statusCode: 429 })).toBe(false);
      expect(isTerminalQueryError(null)).toBe(false);
    });

    it('identifies HTTP 429 Too Many Requests response', () => {
      expect(isRateLimitError({ statusCode: 429 })).toBe(true);
      expect(isRateLimitError({ status: 429 })).toBe(true);
      expect(isRateLimitError({ statusCode: 503 })).toBe(false);
    });

    it('immediately halts polling when an unrecoverable client/auth error occurs', () => {
      const activeJobs: IngestionJobItem[] = [
        {
          id: 'job_1',
          documentId: 'doc_1',
          documentVersionId: 'ver_1',
          status: 'PROCESSING',
          attemptCount: 1,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
        },
      ];

      // Normally active job polls at 3000ms
      expect(getIngestionJobsPollingInterval(activeJobs)).toBe(3000);

      // On 401 Unauthorized or 403 Forbidden, polling must halt
      expect(getIngestionJobsPollingInterval(activeJobs, undefined, { statusCode: 401 })).toBe(
        false,
      );
      expect(getIngestionJobsPollingInterval(activeJobs, undefined, { status: 403 })).toBe(false);
      expect(getIngestionJobsPollingInterval(activeJobs, undefined, { statusCode: 404 })).toBe(
        false,
      );
    });

    it('halts retrieval status polling on terminal client/auth error', () => {
      const activeStatus: IngestionRetrievalStatus = {
        isReadyForRetrieval: false,
        reason: 'In progress',
      };

      expect(getRetrievalStatusPollingInterval(activeStatus)).toBe(4000);
      expect(getRetrievalStatusPollingInterval(activeStatus, undefined, { statusCode: 401 })).toBe(
        false,
      );
      expect(getRetrievalStatusPollingInterval(activeStatus, undefined, { status: 403 })).toBe(
        false,
      );
    });

    it('halts document detail polling on terminal client/auth error', () => {
      const activeDoc: KnowledgeDocumentItem = {
        id: 'doc_1',
        title: 'Doc',
        visibilityScope: 'ALL_STAFF',
        currentVersionId: 'v1',
        uploadedBy: 'usr_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ingestionStatus: 'PROCESSING',
        versions: [],
      };

      expect(getDocumentDetailPollingInterval(activeDoc)).toBe(4000);
      expect(getDocumentDetailPollingInterval(activeDoc, undefined, { statusCode: 401 })).toBe(
        false,
      );
    });

    it('allows retry for rate-limit (429) errors but halts on 401/403/404', () => {
      expect(shouldRetryIngestionQuery(0, { statusCode: 429 })).toBe(true);
      expect(shouldRetryIngestionQuery(2, { statusCode: 429 })).toBe(true);
      expect(shouldRetryIngestionQuery(3, { statusCode: 429 })).toBe(false); // Max retries reached

      expect(shouldRetryIngestionQuery(0, { statusCode: 401 })).toBe(false);
      expect(shouldRetryIngestionQuery(0, { statusCode: 403 })).toBe(false);
      expect(shouldRetryIngestionQuery(0, { statusCode: 404 })).toBe(false);
    });

    it('applies a higher backoff delay for rate-limit (429) responses', () => {
      const normalDelay = getIngestionQueryRetryDelay(0, new Error('Network error'));
      const rateLimitDelay = getIngestionQueryRetryDelay(0, { statusCode: 429 });

      expect(rateLimitDelay).toBeGreaterThan(normalDelay);
      expect(rateLimitDelay).toBe(5000);
    });
  });

  // =========================================================================
  // 2. UX, Accessibility & Reduced Motion Hardening
  // =========================================================================
  describe('UX & Accessibility hardening in components', () => {
    const createMockJobs = (count: number): IngestionJobItem[] => {
      return Array.from({ length: count }, (_, i) => ({
        id: `job_item_${i + 1}`,
        documentId: 'doc_123',
        documentVersionId: `ver_${i + 1}`,
        versionNumber: i + 1,
        status: i === 0 ? 'PROCESSING' : 'READY',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date(Date.now() - i * 60000).toISOString(),
      }));
    };

    it('paginates large processing histories and provides accessible controls', () => {
      const jobs = createMockJobs(25); // 25 attempts

      render(<ProcessingHistoryDiagnostics documentId="doc_123" jobs={jobs} />);

      // Should display pagination summary
      expect(screen.getByTestId('history-pagination')).toBeInTheDocument();
      expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument();

      // Only 10 rows on page 1
      const prevButton = screen.getByTestId('history-pagination-prev');
      const nextButton = screen.getByTestId('history-pagination-next');
      expect(prevButton).toBeDisabled();
      expect(nextButton).not.toBeDisabled();

      // Navigate to page 2
      fireEvent.click(nextButton);
      expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument();
      expect(prevButton).not.toBeDisabled();
    });

    it('adds accessible scope="col" attributes to table headers in processing history', () => {
      const jobs = createMockJobs(2);

      render(<ProcessingHistoryDiagnostics documentId="doc_123" jobs={jobs} />);

      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBe(8);
      headers.forEach((header) => {
        expect(header).toHaveAttribute('scope', 'col');
      });
    });

    it('displays watchdog staleness supervision notice for active in-progress jobs', () => {
      const activeJob: IngestionJobItem = {
        id: 'job_active_01',
        documentId: 'doc_123',
        documentVersionId: 'ver_01',
        status: 'PROCESSING',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
      };

      render(<ProcessingHistoryDiagnostics documentId="doc_123" jobs={[activeJob]} />);

      expect(screen.getByTestId('processing-administrative-box')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Supervisión activa: El servicio watchdog supervisa trabajos en ejecución/,
        ),
      ).toBeInTheDocument();
    });

    it('sets aria-current="step" on the in-progress stage in IngestionLifecycleTimeline', () => {
      const activeJob: IngestionJobItem = {
        id: 'job_timeline_01',
        documentId: 'doc_123',
        documentVersionId: 'ver_01',
        status: 'PROCESSING',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        stages: [
          { stage: 'VALIDATING', status: 'COMPLETED', label: 'Validación' },
          { stage: 'PROCESSING', status: 'IN_PROGRESS', label: 'Extracción' },
          { stage: 'INDEXING', status: 'PENDING', label: 'Indexación' },
        ],
      };

      render(<IngestionLifecycleTimeline documentId="doc_123" job={activeJob} />);

      const validatingItem = screen.getByTestId('stage-item-validating');
      const processingItem = screen.getByTestId('stage-item-processing');
      const indexingItem = screen.getByTestId('stage-item-indexing');

      expect(processingItem).toHaveAttribute('aria-current', 'step');
      expect(validatingItem).not.toHaveAttribute('aria-current');
      expect(indexingItem).not.toHaveAttribute('aria-current');
    });
  });
});
