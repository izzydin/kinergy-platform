import '@testing-library/jest-dom';
import {
  evaluateRecoveryPolicy,
  calculateBackoffWithJitter,
} from '../assistant/services/recovery-policy.service';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
  ConflictError,
  NotFoundError,
  NetworkError,
  ServerError,
} from '../../../shared/api/api-error';
import { notificationService } from '../../../app/providers/notification-provider';
import { sanitizeMetadata, sanitizeValue } from '../../../shared/logger/platform-logger';

describe('ER.09 — Error Recovery Policies & UX Resilience Hardening', () => {
  beforeEach(() => {
    notificationService.clearAll();
    jest.clearAllMocks();
  });

  describe('1. Central Recovery Policy Matrix & Disposition Rules', () => {
    it('classifies 401 unauthenticated errors as REQUIRES_AUTHENTICATION and prevents auto-retry', () => {
      const err = new AuthenticationError('Session expired');
      const policy = evaluateRecoveryPolicy({
        operation: 'QUERY_CONVERSATION_LIST',
        error: err,
      });

      expect(policy.disposition).toBe('REQUIRES_AUTHENTICATION');
      expect(policy.canAutoRetry).toBe(false);
      expect(policy.canUserRetry).toBe(false);
      expect(policy.maxAutoRetries).toBe(0);
      expect(policy.primaryActionLabel).toBe('Iniciar sesión');
    });

    it('classifies 403 authorization denials as REQUIRES_PERMISSION and prevents auto-retry', () => {
      const err = new AuthorizationError('Facility clearance required');
      const policy = evaluateRecoveryPolicy({
        operation: 'QUERY_DOCUMENT_DETAIL',
        error: err,
      });

      expect(policy.disposition).toBe('REQUIRES_PERMISSION');
      expect(policy.canAutoRetry).toBe(false);
      expect(policy.canUserRetry).toBe(false);
      expect(policy.maxAutoRetries).toBe(0);
    });

    it('classifies 400 validation errors as RETRY_NOT_SUPPORTED', () => {
      const err = new ValidationError('Invalid document file format');
      const policy = evaluateRecoveryPolicy({
        operation: 'UPLOAD_DOCUMENT',
        error: err,
      });

      expect(policy.disposition).toBe('RETRY_NOT_SUPPORTED');
      expect(policy.canAutoRetry).toBe(false);
      expect(policy.canUserRetry).toBe(false);
      expect(policy.maxAutoRetries).toBe(0);
    });

    it('classifies 429 rate limit errors as REQUIRES_DIFFERENT_ACTION with backoff wait', () => {
      const err = new RateLimitError('Too many queries', 15);
      const policy = evaluateRecoveryPolicy({
        operation: 'MUTATION_SUBMIT_MESSAGE',
        error: err,
      });

      expect(policy.disposition).toBe('REQUIRES_DIFFERENT_ACTION');
      expect(policy.canAutoRetry).toBe(false);
      expect(policy.canUserRetry).toBe(true);
      expect(policy.backoffDelayMs).toBe(15000);
      expect(policy.userMessage).toContain('15 segundos');
    });

    it('classifies 409 conflict errors as REQUIRES_DIFFERENT_ACTION', () => {
      const err = new ConflictError('Document checksum already exists');
      const policy = evaluateRecoveryPolicy({
        operation: 'UPLOAD_DOCUMENT',
        error: err,
      });

      expect(policy.disposition).toBe('REQUIRES_DIFFERENT_ACTION');
      expect(policy.canAutoRetry).toBe(false);
    });

    it('classifies 404 not found errors as RETRY_NOT_SUPPORTED', () => {
      const err = new NotFoundError('Conversation not found');
      const policy = evaluateRecoveryPolicy({
        operation: 'QUERY_MESSAGE_HISTORY',
        error: err,
      });

      expect(policy.disposition).toBe('RETRY_NOT_SUPPORTED');
      expect(policy.canAutoRetry).toBe(false);
    });

    it('classifies late upload drops (uploadPercentage >= 95%) as RETRY_ONLY_AFTER_RECONCILE', () => {
      const err = new NetworkError('Connection reset by peer');
      const policy = evaluateRecoveryPolicy({
        operation: 'UPLOAD_DOCUMENT',
        error: err,
        uploadPercentage: 97,
      });

      expect(policy.disposition).toBe('RETRY_ONLY_AFTER_RECONCILE');
      expect(policy.canAutoRetry).toBe(false);
      expect(policy.canUserRetry).toBe(false);
      expect(policy.requiresReconciliation).toBe(true);
      expect(policy.primaryActionLabel).toBe('Verificar estado');
    });

    it('classifies message submission timeouts as RETRY_ONLY_AFTER_RECONCILE', () => {
      const err = new ServerError('Gateway timeout', 504, 'TIMEOUT');
      const policy = evaluateRecoveryPolicy({
        operation: 'MUTATION_RESERVE_TURN',
        error: err,
      });

      expect(policy.disposition).toBe('RETRY_ONLY_AFTER_RECONCILE');
      expect(policy.canAutoRetry).toBe(false);
      expect(policy.requiresReconciliation).toBe(true);
      expect(policy.primaryActionLabel).toBe('Reconciliar estado');
    });

    it('allows SAFE_AUTOMATIC_RETRY for read queries with transient errors below retry limit', () => {
      const err = new ServerError('Service unavailable', 503);
      const policy = evaluateRecoveryPolicy({
        operation: 'QUERY_DOCUMENT_LIST',
        error: err,
        attemptCount: 1,
      });

      expect(policy.disposition).toBe('SAFE_AUTOMATIC_RETRY');
      expect(policy.canAutoRetry).toBe(true);
      expect(policy.maxAutoRetries).toBe(3);
      expect(policy.backoffDelayMs).toBeGreaterThan(0);
    });

    it('transitions to SAFE_USER_INITIATED_RETRY when maxAutoRetries is exhausted', () => {
      const err = new ServerError('Service unavailable', 503);
      const policy = evaluateRecoveryPolicy({
        operation: 'QUERY_DOCUMENT_LIST',
        error: err,
        attemptCount: 3,
      });

      expect(policy.disposition).toBe('SAFE_USER_INITIATED_RETRY');
      expect(policy.canAutoRetry).toBe(false);
      expect(policy.canUserRetry).toBe(true);
    });

    it('computes exponential backoff with full jitter within expected bounds', () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const delay = calculateBackoffWithJitter(attempt, 1000, 16000);
        const base = Math.min(16000, 1000 * Math.pow(2, attempt));
        // Jitter is 0.8 to 1.2
        expect(delay).toBeGreaterThanOrEqual(base * 0.75);
        expect(delay).toBeLessThanOrEqual(base * 1.25);
      }
    });
  });

  describe('2. Notification Deduplication & Alert Fatigue Safeguards', () => {
    it('deduplicates identical notifications dispatched within the suppression window', () => {
      const listener = jest.fn();
      const unsub = notificationService.subscribe(listener);

      // Dispatch identical error notifications rapidly
      const id1 = notificationService.error('Connection Failed', 'Failed to reach clinical API');
      const id2 = notificationService.error('Connection Failed', 'Failed to reach clinical API');
      const id3 = notificationService.error('Connection Failed', 'Failed to reach clinical API');

      // First dispatch must succeed; duplicates must be suppressed
      expect(id1).toBeTruthy();
      expect(id2).toBe('');
      expect(id3).toBe('');

      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
    });

    it('allows different notification messages to dispatch immediately', () => {
      const listener = jest.fn();
      const unsub = notificationService.subscribe(listener);

      const id1 = notificationService.error('Error A', 'First unique error');
      const id2 = notificationService.error('Error B', 'Second unique error');

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(listener).toHaveBeenCalledTimes(2);

      unsub();
    });
  });

  describe('3. Telemetry & Log Sanitization Hardening', () => {
    it('redacts raw clinical content, document text, and security keys in telemetry metadata', () => {
      const sensitivePayload = {
        token: 'eyJh...super_secret_jwt',
        apiKey: 'key_live_1234567890',
        password: 'admin_password_123',
        document_text: 'Confidential clinical diagnosis notes for VIP patient...',
        raw_content: 'Confidential body...',
        userPrompt: 'This is a long clinical query with sensitive details '.repeat(15),
        regularField: 'safe_clinical_identifier_123',
      };

      const clean = sanitizeMetadata(sensitivePayload);

      expect(clean?.['token']).toBe('[REDACTED]');
      expect(clean?.['apiKey']).toBe('[REDACTED]');
      expect(clean?.['password']).toBe('[REDACTED]');
      expect(clean?.['document_text']).toBe('[REDACTED]');
      expect(clean?.['raw_content']).toBe('[REDACTED]');
      expect(clean?.['regularField']).toBe('safe_clinical_identifier_123');

      // Prompt should be truncated rather than logged in full
      expect(clean?.['userPrompt']).toContain('... [TRUNCATED');
    });

    it('redacts inline Authorization Bearer tokens in values', () => {
      const value = sanitizeValue('authHeader', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(value).toBe('Bearer [REDACTED]');
    });
  });
});
