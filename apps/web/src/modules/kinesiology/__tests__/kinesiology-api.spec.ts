import { kinesiologyApi } from '../api/kinesiology-api';
import { httpClient } from '../../../shared/api/http-client';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
} from '../../../shared/api/api-error';
import {
  KinesiologyStateTransitionError,
  KinesiologyRecordLockedError,
  KinesiologyDuplicateSessionError,
  KinesiologyConcurrencyError,
  getKinesiologyErrorMessage,
  isStateTransitionConflict,
  isClinicalRecordLocked,
  isDuplicateSessionConflict,
  isOptimisticConcurrencyConflict,
  isTherapistEligibilityError,
  isAppointmentIneligibleError,
} from '../api/kinesiology-error';
import { SessionStatus } from '../types';

jest.mock('../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('Kinesiology API Client Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('serializes payload and invokes POST /api/v1/kinesiology/sessions', async () => {
      const mockSession = {
        id: 'sess_1',
        clientId: 'client_1',
        therapistId: 'therapist_1',
        appointmentId: 'appt_1',
        status: SessionStatus.SCHEDULED,
        notes: {},
        version: 1,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:00:00.000Z',
      };
      (httpClient.post as jest.Mock).mockResolvedValueOnce(mockSession);

      const result = await kinesiologyApi.createSession({
        appointmentId: 'appt_1',
        initialNotes: 'Initial referral note',
        autoStart: false,
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/kinesiology/sessions', {
        appointmentId: 'appt_1',
        initialNotes: 'Initial referral note',
        autoStart: false,
      });
      expect(result).toEqual(mockSession);
    });

    it('rejects with ValidationError if appointmentId is missing', async () => {
      await expect(kinesiologyApi.createSession({ appointmentId: '   ' })).rejects.toThrow(
        ValidationError,
      );
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('getSessionById', () => {
    it('invokes GET /api/v1/kinesiology/sessions/:id with URI encoded ID', async () => {
      const mockSession = {
        id: 'sess_123',
        status: SessionStatus.SCHEDULED,
      };
      (httpClient.get as jest.Mock).mockResolvedValueOnce(mockSession);

      const result = await kinesiologyApi.getSessionById('sess_123');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123');
      expect(result).toEqual(mockSession);
    });

    it('encodes special characters in sessionId', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'sess/special#1' });

      await kinesiologyApi.getSessionById('sess/special#1');

      expect(httpClient.get).toHaveBeenCalledWith(
        '/api/v1/kinesiology/sessions/sess%2Fspecial%231',
      );
    });

    it('rejects with ValidationError if sessionId is empty', async () => {
      await expect(kinesiologyApi.getSessionById('')).rejects.toThrow(ValidationError);
      expect(httpClient.get).not.toHaveBeenCalled();
    });
  });

  describe('startSession', () => {
    it('invokes POST /api/v1/kinesiology/sessions/:id/start without body', async () => {
      const mockSession = { id: 'sess_123', status: SessionStatus.IN_PROGRESS };
      (httpClient.post as jest.Mock).mockResolvedValueOnce(mockSession);

      const result = await kinesiologyApi.startSession('sess_123');

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123/start');
      expect(result.status).toBe(SessionStatus.IN_PROGRESS);
    });

    it('rejects with ValidationError if sessionId is empty', async () => {
      await expect(kinesiologyApi.startSession('   ')).rejects.toThrow(ValidationError);
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('assignTherapist', () => {
    it('serializes newTherapistId and invokes POST /api/v1/kinesiology/sessions/:id/assign-therapist', async () => {
      const mockSession = { id: 'sess_123', therapistId: 'therapist_new' };
      (httpClient.post as jest.Mock).mockResolvedValueOnce(mockSession);

      const result = await kinesiologyApi.assignTherapist('sess_123', {
        newTherapistId: 'therapist_new',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/kinesiology/sessions/sess_123/assign-therapist',
        { newTherapistId: 'therapist_new' },
      );
      expect(result.therapistId).toBe('therapist_new');
    });

    it('rejects if newTherapistId is blank', async () => {
      await expect(
        kinesiologyApi.assignTherapist('sess_123', { newTherapistId: '' }),
      ).rejects.toThrow(ValidationError);
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('updateNotes', () => {
    it('invokes PUT /api/v1/kinesiology/sessions/:id/notes with serialized notes payload', async () => {
      const mockSession = {
        id: 'sess_123',
        notes: { subjective: 'Pain resolved' },
        version: 2,
      };
      (httpClient.put as jest.Mock).mockResolvedValueOnce(mockSession);

      const result = await kinesiologyApi.updateNotes('sess_123', {
        subjective: 'Pain resolved',
        expectedVersion: 1,
      });

      expect(httpClient.put).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123/notes', {
        subjective: 'Pain resolved',
        expectedVersion: 1,
      });
      expect(result).toEqual(mockSession);
    });

    it('rejects with ValidationError if sessionId is empty', async () => {
      await expect(kinesiologyApi.updateNotes('', { subjective: 'Testing' })).rejects.toThrow(
        ValidationError,
      );
      expect(httpClient.put).not.toHaveBeenCalled();
    });
  });

  describe('completeSession', () => {
    it('invokes POST /api/v1/kinesiology/sessions/:id/complete', async () => {
      const mockSession = { id: 'sess_123', status: SessionStatus.COMPLETED };
      (httpClient.post as jest.Mock).mockResolvedValueOnce(mockSession);

      const result = await kinesiologyApi.completeSession('sess_123');

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/kinesiology/sessions/sess_123/complete',
      );
      expect(result.status).toBe(SessionStatus.COMPLETED);
    });

    it('rejects with ValidationError if sessionId is empty', async () => {
      await expect(kinesiologyApi.completeSession(' ')).rejects.toThrow(ValidationError);
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('cancelSession', () => {
    it('invokes POST /api/v1/kinesiology/sessions/:id/cancel with mandatory reason', async () => {
      const mockSession = {
        id: 'sess_123',
        status: SessionStatus.CANCELLED,
        cancellationReason: 'Client requested reschedule',
      };
      (httpClient.post as jest.Mock).mockResolvedValueOnce(mockSession);

      const result = await kinesiologyApi.cancelSession('sess_123', {
        reason: 'Client requested reschedule',
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123/cancel', {
        reason: 'Client requested reschedule',
      });
      expect(result.status).toBe(SessionStatus.CANCELLED);
    });

    it('rejects with ValidationError if reason is blank', async () => {
      await expect(kinesiologyApi.cancelSession('sess_123', { reason: '   ' })).rejects.toThrow(
        ValidationError,
      );
      expect(httpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('getClientTreatmentHistory', () => {
    it('invokes GET with sanitized query params', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await kinesiologyApi.getClientTreatmentHistory('client_456', {
        page: 2,
        limit: 10,
        status: SessionStatus.COMPLETED,
      });

      expect(httpClient.get).toHaveBeenCalledWith(
        '/api/v1/kinesiology/clients/client_456/treatment-history',
        {
          params: { page: 2, limit: 10, status: SessionStatus.COMPLETED },
        },
      );
    });

    it('omits undefined params from request options', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await kinesiologyApi.getClientTreatmentHistory('client_456', {});

      expect(httpClient.get).toHaveBeenCalledWith(
        '/api/v1/kinesiology/clients/client_456/treatment-history',
      );
    });

    it('rejects with ValidationError if clientId is empty', async () => {
      await expect(kinesiologyApi.getClientTreatmentHistory('')).rejects.toThrow(ValidationError);
      expect(httpClient.get).not.toHaveBeenCalled();
    });
  });

  describe('Structured Backend Error Normalization', () => {
    it('preserves and normalizes 400 ValidationError', async () => {
      const backendError = new ValidationError('Invalid input data', {
        'notes.subjective': ['Subjective note exceeds maximum length'],
      });
      (httpClient.put as jest.Mock).mockRejectedValueOnce(backendError);

      await expect(
        kinesiologyApi.updateNotes('sess_123', { subjective: 'Long note' }),
      ).rejects.toThrow(ValidationError);
    });

    it('preserves and normalizes 401 AuthenticationError', async () => {
      (httpClient.get as jest.Mock).mockRejectedValueOnce(
        new AuthenticationError('Invalid or expired authentication token.'),
      );

      await expect(kinesiologyApi.getSessionById('sess_123')).rejects.toThrow(AuthenticationError);
    });

    it('preserves and normalizes 403 AuthorizationError', async () => {
      (httpClient.post as jest.Mock).mockRejectedValueOnce(
        new AuthorizationError('Insufficient permissions to complete session.'),
      );

      await expect(kinesiologyApi.completeSession('sess_123')).rejects.toThrow(AuthorizationError);
    });

    it('preserves and normalizes 404 NotFoundError', async () => {
      (httpClient.get as jest.Mock).mockRejectedValueOnce(
        new NotFoundError('TreatmentSession not found: sess_missing'),
      );

      await expect(kinesiologyApi.getSessionById('sess_missing')).rejects.toThrow(NotFoundError);
    });

    it('transforms 422 state transition conflict into KinesiologyStateTransitionError', async () => {
      const unprocessableErr = {
        statusCode: 422,
        code: 'TREATMENT_SESSION_INVALID_STATE_TRANSITION',
        message: 'Cannot transition TreatmentSession from COMPLETED to IN_PROGRESS',
      };
      (httpClient.post as jest.Mock).mockRejectedValueOnce(unprocessableErr);

      await expect(kinesiologyApi.startSession('sess_123')).rejects.toThrow(
        KinesiologyStateTransitionError,
      );
    });

    it('transforms 422 record locked into KinesiologyRecordLockedError', async () => {
      const lockedErr = {
        statusCode: 422,
        code: 'CLINICAL_RECORD_LOCKED',
        message: 'Treatment session notes are permanently locked after completion',
      };
      (httpClient.put as jest.Mock).mockRejectedValueOnce(lockedErr);

      await expect(
        kinesiologyApi.updateNotes('sess_123', { subjective: 'Edit completed' }),
      ).rejects.toThrow(KinesiologyRecordLockedError);
    });

    it('transforms 409 duplicate session into KinesiologyDuplicateSessionError', async () => {
      const conflictErr = new ConflictError(
        'A TreatmentSession already exists for appointment appt_1',
        undefined,
        { code: 'DUPLICATE_TREATMENT_SESSION' },
      );
      (httpClient.post as jest.Mock).mockRejectedValueOnce(conflictErr);

      await expect(kinesiologyApi.createSession({ appointmentId: 'appt_1' })).rejects.toThrow(
        KinesiologyDuplicateSessionError,
      );
    });

    it('transforms 409 version conflict into KinesiologyConcurrencyError', async () => {
      const concurrencyErr = new ConflictError(
        'Concurrent edit detected: expected version 1 but found version 2',
        undefined,
        { code: 'CONCURRENT_MODIFICATION' },
      );
      (httpClient.put as jest.Mock).mockRejectedValueOnce(concurrencyErr);

      await expect(kinesiologyApi.updateNotes('sess_123', { expectedVersion: 1 })).rejects.toThrow(
        KinesiologyConcurrencyError,
      );
    });
  });

  describe('Clinical Error Type Guards and Leak Prevention', () => {
    it('correctly classifies domain conflict errors using type guards', () => {
      const stateErr = new KinesiologyStateTransitionError(
        'Cannot transition TreatmentSession from SCHEDULED to COMPLETED',
      );
      expect(isStateTransitionConflict(stateErr)).toBe(true);
      expect(isClinicalRecordLocked(stateErr)).toBe(false);

      const lockedErr = new KinesiologyRecordLockedError(
        'Clinical record is finalized and permanently locked.',
      );
      expect(isClinicalRecordLocked(lockedErr)).toBe(true);

      const dupErr = new KinesiologyDuplicateSessionError(
        'A TreatmentSession already exists for this appointment.',
      );
      expect(isDuplicateSessionConflict(dupErr)).toBe(true);

      const concErr = new KinesiologyConcurrencyError(
        'This treatment session was modified concurrently by another user.',
      );
      expect(isOptimisticConcurrencyConflict(concErr)).toBe(true);

      const ineligApptErr = {
        statusCode: 422,
        code: 'APPOINTMENT_INELIGIBLE_FOR_TREATMENT',
        message: 'Appointment is not confirmed or ineligible for clinical session.',
      };
      expect(isAppointmentIneligibleError(ineligApptErr)).toBe(true);

      const ineligTherapistErr = {
        statusCode: 422,
        code: 'THERAPIST_NOT_ELIGIBLE',
        message: 'Assigned therapist is not active or eligible.',
      };
      expect(isTherapistEligibilityError(ineligTherapistErr)).toBe(true);
    });

    it('sanitizes clinical error messages and does not leak raw payload notes', () => {
      const rawSoap = 'Subjective: Patient has severe acute pain in lumbar spine L4-L5.';
      const sensitiveErr = new Error(
        `Failed to persist notes: ${rawSoap} (Internal database row lock)`,
      );

      const sanitizedMessage = getKinesiologyErrorMessage(sensitiveErr);
      expect(sanitizedMessage).not.toContain(rawSoap);
      expect(sanitizedMessage).toBe(
        'An unexpected error occurred during treatment session processing.',
      );
    });

    it('returns clear, friendly messages for structured domain errors', () => {
      const stateErr = new KinesiologyStateTransitionError(
        'Cannot transition from SCHEDULED to COMPLETED',
      );
      expect(getKinesiologyErrorMessage(stateErr)).toBe(
        'Cannot transition from SCHEDULED to COMPLETED',
      );

      const lockedErr = new KinesiologyRecordLockedError(
        'Clinical record is signed and permanently locked.',
      );
      expect(getKinesiologyErrorMessage(lockedErr)).toBe(
        'This clinical record is finalized and cannot be modified.',
      );

      const concErr = new KinesiologyConcurrencyError('Concurrent edit collision');
      expect(getKinesiologyErrorMessage(concErr)).toBe(
        'The session was updated concurrently. Please refresh the page before saving changes.',
      );

      const dupErr = new KinesiologyDuplicateSessionError('Duplicate session');
      expect(getKinesiologyErrorMessage(dupErr)).toBe(
        'A treatment session has already been created for this appointment.',
      );
    });
  });
});
