import {
  IngestionRetryPolicy,
  IngestionErrorCode,
  DEFAULT_RETRY_POLICY,
} from '../ingestion-retry.policy';

describe('IngestionRetryPolicy', () => {
  describe('isRetryable', () => {
    it('should identify transient network, storage, and deadlock errors as retryable', () => {
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.STORAGE_TIMEOUT)).toBe(true);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.STORAGE_UNAVAILABLE)).toBe(true);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.DATABASE_TRANSIENT_ERROR)).toBe(
        true,
      );
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.PROCESSING_TIMEOUT)).toBe(true);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.NETWORK_TRANSIENT_ERROR)).toBe(
        true,
      );
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.RATE_LIMITED)).toBe(true);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.WORKER_CRASH_RECOVERED)).toBe(
        true,
      );
    });

    it('should identify permanent validation, security, and missing file errors as non-retryable', () => {
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.DOCUMENT_NOT_FOUND)).toBe(false);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.STORAGE_OBJECT_MISSING)).toBe(
        false,
      );
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.CHECKSUM_MISMATCH)).toBe(false);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.UNSUPPORTED_FORMAT)).toBe(false);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.MALFORMED_CONTENT)).toBe(false);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.SECURITY_VIOLATION)).toBe(false);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.CANCELLED_BY_USER)).toBe(false);
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED)).toBe(
        false,
      );
      expect(IngestionRetryPolicy.isRetryable(IngestionErrorCode.UNKNOWN_NON_RETRYABLE)).toBe(
        false,
      );
    });
  });

  describe('classifyError', () => {
    it('should classify timeout errors as STORAGE_TIMEOUT with isRetryable=true', () => {
      const err = new Error('Connection ETIMEDOUT when contacting storage cluster');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.STORAGE_TIMEOUT);
      expect(classification.isRetryable).toBe(true);
    });

    it('should classify 503 / Service Unavailable errors as STORAGE_UNAVAILABLE with isRetryable=true', () => {
      const err = new Error('HTTP 503 Service Unavailable: SlowDown');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.STORAGE_UNAVAILABLE);
      expect(classification.isRetryable).toBe(true);
    });

    it('should classify ECONNRESET as NETWORK_TRANSIENT_ERROR with isRetryable=true', () => {
      const err = new Error('read ECONNRESET');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.NETWORK_TRANSIENT_ERROR);
      expect(classification.isRetryable).toBe(true);
    });

    it('should classify Prisma deadlocks / P2034 as DATABASE_TRANSIENT_ERROR with isRetryable=true', () => {
      const err = new Error('Transaction failed due to a deadlock. Error code: P2034');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.DATABASE_TRANSIENT_ERROR);
      expect(classification.isRetryable).toBe(true);
    });

    it('should classify missing document errors as DOCUMENT_NOT_FOUND with isRetryable=false', () => {
      const err = new Error('Referenced document "doc-123" does not exist or was deleted');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.DOCUMENT_NOT_FOUND);
      expect(classification.isRetryable).toBe(false);
    });

    it('should classify missing storage keys as STORAGE_OBJECT_MISSING with isRetryable=false', () => {
      const err = new Error('NoSuchKey: The specified key does not exist (404)');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.STORAGE_OBJECT_MISSING);
      expect(classification.isRetryable).toBe(false);
    });

    it('should classify checksum failures as CHECKSUM_MISMATCH with isRetryable=false', () => {
      const err = new Error('Document checksum hash mismatch between record and storage');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.CHECKSUM_MISMATCH);
      expect(classification.isRetryable).toBe(false);
    });

    it('should classify security violations (zip bombs, scripts) as SECURITY_VIOLATION with isRetryable=false', () => {
      const err = new Error('Security policy triggered: zip bomb compression ratio exceeded');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.SECURITY_VIOLATION);
      expect(classification.isRetryable).toBe(false);
    });

    it('should classify user cancellation as CANCELLED_BY_USER with isRetryable=false', () => {
      const err = new Error('Operation was cancelled by user');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.CANCELLED_BY_USER);
      expect(classification.isRetryable).toBe(false);
    });

    it('should default unrecognized errors to UNKNOWN_NON_RETRYABLE to prevent infinite retry loops', () => {
      const err = new TypeError('Cannot read properties of undefined');
      const classification = IngestionRetryPolicy.classifyError(err);

      expect(classification.code).toBe(IngestionErrorCode.UNKNOWN_NON_RETRYABLE);
      expect(classification.isRetryable).toBe(false);
    });
  });

  describe('computeNextRetryAt', () => {
    const fixedNow = 1700000000000;

    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should compute deterministic exponential backoff for attempts 1, 2, and 3 without jitter', () => {
      const noJitterRng = () => 0; // 0 jitter

      // Attempt 1: 5000 * 2^0 = 5000ms
      const retry1 = IngestionRetryPolicy.computeNextRetryAt(
        1,
        { baseDelayMs: 5000, maxDelayMs: 300000, jitterFactor: 0.2 },
        noJitterRng,
      );
      expect(retry1.getTime()).toBe(fixedNow + 5000);

      // Attempt 2: 5000 * 2^1 = 10000ms
      const retry2 = IngestionRetryPolicy.computeNextRetryAt(
        2,
        { baseDelayMs: 5000, maxDelayMs: 300000, jitterFactor: 0.2 },
        noJitterRng,
      );
      expect(retry2.getTime()).toBe(fixedNow + 10000);

      // Attempt 3: 5000 * 2^2 = 20000ms
      const retry3 = IngestionRetryPolicy.computeNextRetryAt(
        3,
        { baseDelayMs: 5000, maxDelayMs: 300000, jitterFactor: 0.2 },
        noJitterRng,
      );
      expect(retry3.getTime()).toBe(fixedNow + 20000);
    });

    it('should add randomized jitter up to jitterFactor', () => {
      const fullJitterRng = () => 1; // 100% of jitter factor (0.2)
      // Attempt 1: 5000 + 5000 * 0.2 * 1 = 6000ms
      const retry = IngestionRetryPolicy.computeNextRetryAt(
        1,
        { baseDelayMs: 5000, maxDelayMs: 300000, jitterFactor: 0.2 },
        fullJitterRng,
      );
      expect(retry.getTime()).toBe(fixedNow + 6000);
    });

    it('should clamp total delay to maxDelayMs', () => {
      const noJitterRng = () => 0;
      // High attempt number would be 5000 * 2^9 = 2,560,000ms, clamped to 300,000ms
      const retry = IngestionRetryPolicy.computeNextRetryAt(
        10,
        { baseDelayMs: 5000, maxDelayMs: 300000, jitterFactor: 0.2 },
        noJitterRng,
      );
      expect(retry.getTime()).toBe(fixedNow + 300000);
    });

    it('should use default policy settings when options omitted', () => {
      const retry = IngestionRetryPolicy.computeNextRetryAt(1, {}, () => 0);
      expect(retry.getTime()).toBe(fixedNow + DEFAULT_RETRY_POLICY.baseDelayMs);
    });
  });
});
