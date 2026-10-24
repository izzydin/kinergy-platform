import {
  formatSchedulingErrorMessage,
  getSchedulingConflictDetails,
  isAppointmentStateTransitionError,
  isOptimisticLockError,
  isRoomMaintenanceConflict,
  isSchedulingConflictError,
  isTherapistUnavailableConflict,
} from '../scheduling-error';
import {
  ConflictError,
  AuthorizationError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  NetworkError,
  ServerError,
} from '../../../../shared/api/api-error';

describe('scheduling-error Error Handling & Normalization Tests', () => {
  describe('1. Conflict Error Guards & Diagnostic Extraction', () => {
    it('isSchedulingConflictError identifies ConflictError instance', () => {
      const error = new ConflictError('Conflict detected');
      expect(isSchedulingConflictError(error)).toBe(true);
    });

    it('isSchedulingConflictError identifies raw 409 object with conflicts array', () => {
      const rawError = {
        statusCode: 409,
        message: 'Conflict',
        conflicts: [{ category: 'THERAPIST', reason: 'Therapist is double-booked' }],
      };
      expect(isSchedulingConflictError(rawError)).toBe(true);
    });

    it('getSchedulingConflictDetails extracts diagnostics from responseData', () => {
      const conflictPayload = [
        { category: 'ROOM', conflictingEntityId: 'room-1', reason: 'Room is occupied' },
      ];
      const error = new ConflictError('Room conflict', undefined, { conflicts: conflictPayload });

      const extracted = getSchedulingConflictDetails(error);
      expect(extracted).toEqual(conflictPayload);
    });

    it('getSchedulingConflictDetails returns empty array for non-conflict error', () => {
      const error = new NotFoundError('Room not found');
      expect(getSchedulingConflictDetails(error)).toEqual([]);
    });

    it('isRoomMaintenanceConflict detects maintenance categories', () => {
      const error = new ConflictError('Room conflict', undefined, {
        conflicts: [{ category: 'MAINTENANCE', reason: 'Room undergoing floor maintenance' }],
      });
      expect(isRoomMaintenanceConflict(error)).toBe(true);

      const generalError = new Error('Maintenance window active');
      expect(isRoomMaintenanceConflict(generalError)).toBe(true);
    });

    it('isTherapistUnavailableConflict detects therapist working hours / vacation', () => {
      const error = new ConflictError('Therapist conflict', undefined, {
        conflicts: [{ category: 'VACATION', reason: 'Therapist on annual leave' }],
      });
      expect(isTherapistUnavailableConflict(error)).toBe(true);

      const generalError = new Error('No active working hours for therapist');
      expect(isTherapistUnavailableConflict(generalError)).toBe(true);
    });
  });

  describe('2. Concurrency & State Machine Errors', () => {
    it('isOptimisticLockError identifies version conflicts', () => {
      const error409 = new ConflictError('Optimistic concurrency lock version conflict');
      expect(isOptimisticLockError(error409)).toBe(true);

      const errorRaw = { statusCode: 412, message: 'Resource version modified' };
      expect(isOptimisticLockError(errorRaw)).toBe(true);
    });

    it('isAppointmentStateTransitionError identifies terminal state and invalid transitions', () => {
      const error = new ValidationError('Cannot cancel appointment in terminal COMPLETED status');
      expect(isAppointmentStateTransitionError(error)).toBe(true);
    });
  });

  describe('3. formatSchedulingErrorMessage Formatting', () => {
    it('formats conflict diagnostics with high clarity', () => {
      const error = new ConflictError('Conflict', undefined, {
        conflicts: [
          { category: 'THERAPIST', reason: 'Therapist is booked.' },
          { category: 'ROOM', reason: 'Room under maintenance.' },
        ],
      });

      const message = formatSchedulingErrorMessage(error);
      expect(message).toBe('Therapist is booked. Room under maintenance.');
    });

    it('formats optimistic lock error with actionable message', () => {
      const error = new ConflictError('Optimistic concurrency lock version conflict');
      const message = formatSchedulingErrorMessage(error);
      expect(message).toContain('modified by another staff member');
    });

    it('formats AuthorizationError cleanly', () => {
      const error = new AuthorizationError();
      const message = formatSchedulingErrorMessage(error);
      expect(message).toBe('You do not have permission to perform this scheduling operation.');
    });

    it('formats AuthenticationError cleanly', () => {
      const error = new AuthenticationError();
      const message = formatSchedulingErrorMessage(error);
      expect(message).toBe('Your session has expired. Please log in again to continue.');
    });

    it('formats NotFoundError cleanly', () => {
      const error = new NotFoundError();
      const message = formatSchedulingErrorMessage(error);
      expect(message).toBe('The requested appointment, room, or series was not found.');
    });

    it('formats ValidationError with field details', () => {
      const error = new ValidationError('Validation failed', {
        reason: ['Cancellation reason must not be empty.'],
      });
      const message = formatSchedulingErrorMessage(error);
      expect(message).toContain('Cancellation reason must not be empty.');
    });

    it('formats NetworkError cleanly', () => {
      const error = new NetworkError();
      const message = formatSchedulingErrorMessage(error);
      expect(message).toContain('Unable to connect to the scheduling service');
    });

    it('formats ServerError cleanly', () => {
      const error = new ServerError('Internal database failure');
      const message = formatSchedulingErrorMessage(error);
      expect(message).toBe('Internal database failure');
    });

    it('falls back to custom fallback message when error is null/undefined', () => {
      expect(formatSchedulingErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
    });
  });
});
