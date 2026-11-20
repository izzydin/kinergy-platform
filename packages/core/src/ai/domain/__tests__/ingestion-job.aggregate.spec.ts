import { IngestionJob } from '../models/ingestion-job.aggregate';
import { IngestionStatus } from '../enums/ingestion-status.enum';
import {
  InvalidStateTransitionException,
  InvalidIngestionRetryException,
  IngestionJobCancellationConflictException,
  UnauthorizedDocumentAccessException,
  DocumentValidationException,
} from '../exceptions/knowledge-document.exceptions';
import {
  IngestionJobCreatedEvent,
  IngestionJobValidationStartedEvent,
  IngestionJobProcessingStartedEvent,
  IngestionJobIndexingStartedEvent,
  IngestionJobCompletedEvent,
  IngestionJobFailedEvent,
  IngestionJobCancelledEvent,
  IngestionJobRetriedEvent,
} from '../events/ingestion-job-events';

describe('IngestionJob Aggregate Root', () => {
  const defaultProps = {
    documentId: 'doc_100',
    documentVersionId: 'ver_200',
    tenantId: 'tenant_main',
  };

  describe('Creation', () => {
    it('should create an IngestionJob in UPLOADED status with initial attemptCount = 1', () => {
      const job = IngestionJob.create(defaultProps);

      expect(job.id).toBeDefined();
      expect(job.documentId).toBe('doc_100');
      expect(job.documentVersionId).toBe('ver_200');
      expect(job.tenantId).toBe('tenant_main');
      expect(job.status).toBe(IngestionStatus.UPLOADED);
      expect(job.attemptCount).toBe(1);
      expect(job.maxAttempts).toBe(3);
      expect(job.lastErrorCode).toBeNull();
      expect(job.lastErrorMessage).toBeNull();
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.startedAt).toBeNull();
      expect(job.completedAt).toBeNull();
      expect(job.isTerminal()).toBe(false);

      const events = job.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(IngestionJobCreatedEvent);
    });

    it('should reject creation with empty required fields', () => {
      expect(() => IngestionJob.create({ ...defaultProps, documentId: '' })).toThrow(
        DocumentValidationException,
      );

      expect(() => IngestionJob.create({ ...defaultProps, documentVersionId: ' ' })).toThrow(
        DocumentValidationException,
      );

      expect(() => IngestionJob.create({ ...defaultProps, tenantId: '' })).toThrow(
        DocumentValidationException,
      );

      expect(() => IngestionJob.create({ ...defaultProps, maxAttempts: 0 })).toThrow(
        DocumentValidationException,
      );
    });
  });

  describe('Happy Path Lifecycle: UPLOADED -> VALIDATING -> PROCESSING -> INDEXING -> READY', () => {
    it('should execute full ingestion sequence and reach READY terminal state', () => {
      const job = IngestionJob.create(defaultProps);
      job.clearEvents();

      // 1. UPLOADED -> VALIDATING
      job.startValidation();
      expect(job.status).toBe(IngestionStatus.VALIDATING);
      expect(job.startedAt).toBeInstanceOf(Date);
      expect(job.version).toBe(2);

      // 2. VALIDATING -> PROCESSING
      job.startProcessing();
      expect(job.status).toBe(IngestionStatus.PROCESSING);
      expect(job.version).toBe(3);

      // 3. PROCESSING -> INDEXING
      job.startIndexing();
      expect(job.status).toBe(IngestionStatus.INDEXING);
      expect(job.version).toBe(4);

      // 4. INDEXING -> READY
      job.markReady();
      expect(job.status).toBe(IngestionStatus.READY);
      expect(job.completedAt).toBeInstanceOf(Date);
      expect(job.isTerminal()).toBe(true);
      expect(job.version).toBe(5);

      const events = job.getUncommittedEvents();
      expect(events).toHaveLength(4);
      expect(events[0]).toBeInstanceOf(IngestionJobValidationStartedEvent);
      expect(events[1]).toBeInstanceOf(IngestionJobProcessingStartedEvent);
      expect(events[2]).toBeInstanceOf(IngestionJobIndexingStartedEvent);
      expect(events[3]).toBeInstanceOf(IngestionJobCompletedEvent);
    });

    it('should reject skipping steps to reach READY prematurely', () => {
      const job = IngestionJob.create(defaultProps);

      // Cannot jump from UPLOADED to READY
      expect(() => job.markReady()).toThrow(InvalidStateTransitionException);

      job.startValidation();
      // Cannot jump from VALIDATING to READY
      expect(() => job.markReady()).toThrow(InvalidStateTransitionException);

      job.startProcessing();
      // Cannot jump from PROCESSING to READY
      expect(() => job.markReady()).toThrow(InvalidStateTransitionException);
    });
  });

  describe('Failure Transitions', () => {
    it('should transition to FAILED from VALIDATING, recording error codes and details', () => {
      const job = IngestionJob.create(defaultProps);
      job.startValidation();
      job.clearEvents();

      job.fail('CORRUPT_PDF', 'PDF stream header corrupted.');

      expect(job.status).toBe(IngestionStatus.FAILED);
      expect(job.lastErrorCode).toBe('CORRUPT_PDF');
      expect(job.lastErrorMessage).toBe('PDF stream header corrupted.');
      expect(job.isTerminal()).toBe(false); // Can be retried

      const events = job.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(IngestionJobFailedEvent);
    });

    it('should transition to FAILED from PROCESSING and INDEXING', () => {
      const jobProc = IngestionJob.create(defaultProps);
      jobProc.startValidation();
      jobProc.startProcessing();
      jobProc.fail('PARSER_TIMEOUT', 'Text extraction exceeded timeout.');
      expect(jobProc.status).toBe(IngestionStatus.FAILED);

      const jobIdx = IngestionJob.create(defaultProps);
      jobIdx.startValidation();
      jobIdx.startProcessing();
      jobIdx.startIndexing();
      jobIdx.fail('EMBEDDING_OOM', 'Ollama GPU out of memory.');
      expect(jobIdx.status).toBe(IngestionStatus.FAILED);
    });

    it('should reject failing an already READY or CANCELLED job', () => {
      const jobReady = IngestionJob.create(defaultProps);
      jobReady.startValidation();
      jobReady.startProcessing();
      jobReady.startIndexing();
      jobReady.markReady();

      expect(() => jobReady.fail('LATE_ERROR', 'Too late')).toThrow(
        InvalidStateTransitionException,
      );

      const jobCancelled = IngestionJob.create(defaultProps);
      jobCancelled.cancel('User requested');
      expect(() => jobCancelled.fail('ERROR', 'Error on cancelled')).toThrow(
        InvalidStateTransitionException,
      );
    });
  });

  describe('Cancellation Transitions & Invariants', () => {
    it('should allow cancellation from active states (UPLOADED, VALIDATING, PROCESSING, INDEXING)', () => {
      // From UPLOADED
      const j1 = IngestionJob.create(defaultProps);
      j1.clearEvents();
      j1.cancel('No longer needed');
      expect(j1.status).toBe(IngestionStatus.CANCELLED);
      expect(j1.cancellationReason).toBe('No longer needed');
      expect(j1.cancelledAt).toBeInstanceOf(Date);
      expect(j1.isTerminal()).toBe(true);

      const events = j1.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(IngestionJobCancelledEvent);

      // From PROCESSING
      const j2 = IngestionJob.create(defaultProps);
      j2.startValidation();
      j2.startProcessing();
      j2.cancel('User stopped upload');
      expect(j2.status).toBe(IngestionStatus.CANCELLED);
    });

    it('should prevent cancelling a completed READY job', () => {
      const job = IngestionJob.create(defaultProps);
      job.startValidation();
      job.startProcessing();
      job.startIndexing();
      job.markReady();

      expect(() => job.cancel('Cancel completed')).toThrow(
        IngestionJobCancellationConflictException,
      );
    });

    it('should prevent re-cancelling an already cancelled job', () => {
      const job = IngestionJob.create(defaultProps);
      job.cancel('First cancellation');

      expect(() => job.cancel('Second cancellation')).toThrow(
        IngestionJobCancellationConflictException,
      );
    });

    it('should prevent cancelling a FAILED job directly (must retry or create new job)', () => {
      const job = IngestionJob.create(defaultProps);
      job.startValidation();
      job.fail('ERROR', 'Failed');

      expect(() => job.cancel()).toThrow(InvalidStateTransitionException);
    });
  });

  describe('Controlled Retry Transitions', () => {
    it('should allow controlled retry of FAILED jobs within maxAttempts ceiling', () => {
      const job = IngestionJob.create({ ...defaultProps, maxAttempts: 3 });
      job.startValidation();
      job.fail('TEMP_NETWORK', 'Ollama daemon unreachable');

      expect(job.canRetry()).toBe(true);
      expect(job.attemptCount).toBe(1);

      // Retry 1 -> attemptCount becomes 2
      const retryDate = new Date(Date.now() + 5000);
      job.clearEvents();
      job.retry(retryDate);

      expect(job.status).toBe(IngestionStatus.VALIDATING);
      expect(job.attemptCount).toBe(2);
      expect(job.nextRetryAt).toEqual(retryDate);
      expect(job.lastErrorCode).toBeNull();
      expect(job.lastErrorMessage).toBeNull();

      const retryEvents = job.getUncommittedEvents();
      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0]).toBeInstanceOf(IngestionJobRetriedEvent);

      // Fail attempt 2
      job.fail('GPU_BUSY', 'CUDA concurrency ceiling');
      expect(job.canRetry()).toBe(true);

      // Retry 2 -> attemptCount becomes 3 (maxAttempts reached)
      job.retry();
      expect(job.attemptCount).toBe(3);
      expect(job.status).toBe(IngestionStatus.VALIDATING);

      // Fail attempt 3
      job.fail('FINAL_ERROR', 'Permanent failure');
      expect(job.canRetry()).toBe(false);

      // Exceeded maxAttempts: attempting another retry must throw!
      expect(() => job.retry()).toThrow(InvalidIngestionRetryException);
    });

    it('should prevent retrying CANCELLED or READY jobs', () => {
      const jobCancelled = IngestionJob.create(defaultProps);
      jobCancelled.cancel('User aborted');

      expect(() => jobCancelled.retry()).toThrow(InvalidIngestionRetryException);

      const jobReady = IngestionJob.create(defaultProps);
      jobReady.startValidation();
      jobReady.startProcessing();
      jobReady.startIndexing();
      jobReady.markReady();

      expect(() => jobReady.retry()).toThrow(InvalidIngestionRetryException);
    });

    it('should prevent retrying actively processing jobs', () => {
      const job = IngestionJob.create(defaultProps);
      expect(() => job.retry()).toThrow(InvalidIngestionRetryException);

      job.startValidation();
      expect(() => job.retry()).toThrow(InvalidIngestionRetryException);
    });
  });

  describe('Tenant Boundary Assertion', () => {
    it('should verify matching tenant and reject cross-tenant access', () => {
      const job = IngestionJob.create({ ...defaultProps, tenantId: 'tenant_safe' });

      expect(() => job.assertTenantOwnership('tenant_safe')).not.toThrow();
      expect(() => job.assertTenantOwnership('tenant_intruder')).toThrow(
        UnauthorizedDocumentAccessException,
      );
    });
  });
});
