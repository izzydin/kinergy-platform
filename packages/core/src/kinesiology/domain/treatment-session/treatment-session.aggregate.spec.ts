import { TreatmentSession } from './treatment-session.aggregate';
import { SessionId } from './session-id.vo';
import { SessionStatus } from './session-status.enum';
import { SessionNotes } from './session-notes.vo';
import { TestClock } from '../shared/clock';
import { InvalidSessionTransitionException } from '../exceptions/invalid-session-transition.exception';

describe('TreatmentSession Aggregate Root', () => {
  const initialDate = new Date('2026-08-15T14:00:00.000Z');
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(initialDate);
  });

  const createDefaultSession = () =>
    TreatmentSession.create(
      {
        clientId: 'client_123',
        therapistId: 'therapist_456',
        appointmentId: 'appt_789',
        notes: SessionNotes.create('Initial consultation notes'),
      },
      clock,
    );

  describe('Creation', () => {
    it('should create a new TreatmentSession in SCHEDULED status with version 1', () => {
      const session = createDefaultSession();

      expect(session.id).toBeDefined();
      expect(session.id.getValue().startsWith('sess_')).toBe(true);
      expect(session.version).toBe(1);
      expect(session.status).toBe(SessionStatus.SCHEDULED);
      expect(session.clientId).toBe('client_123');
      expect(session.therapistId).toBe('therapist_456');
      expect(session.appointmentId).toBe('appt_789');
      expect(session.notes.getRawText()).toBe('Initial consultation notes');
      expect(session.createdAt).toEqual(initialDate);
      expect(session.updatedAt).toEqual(initialDate);
      expect(session.cancellationReason).toBeUndefined();
      expect(session.getUncommittedEvents()).toEqual([]);
    });

    it('should allow creating a TreatmentSession with a custom SessionId', () => {
      const customId = SessionId.create('sess_custom_999');
      const session = TreatmentSession.create(
        {
          id: customId,
          clientId: 'client_123',
          therapistId: 'therapist_456',
          appointmentId: 'appt_789',
        },
        clock,
      );

      expect(session.id.equals(customId)).toBe(true);
    });

    it('should create session with empty notes when no notes are provided', () => {
      const session = TreatmentSession.create(
        {
          clientId: 'client_123',
          therapistId: 'therapist_456',
          appointmentId: 'appt_789',
        },
        clock,
      );

      expect(session.notes.hasContent()).toBe(false);
    });

    it('should throw an error if clientId is empty or whitespace', () => {
      expect(() =>
        TreatmentSession.create(
          {
            clientId: '',
            therapistId: 'therapist_456',
            appointmentId: 'appt_789',
          },
          clock,
        ),
      ).toThrow('Client ID cannot be empty.');

      expect(() =>
        TreatmentSession.create(
          {
            clientId: '   ',
            therapistId: 'therapist_456',
            appointmentId: 'appt_789',
          },
          clock,
        ),
      ).toThrow('Client ID cannot be empty.');
    });

    it('should throw an error if therapistId is empty or whitespace', () => {
      expect(() =>
        TreatmentSession.create(
          {
            clientId: 'client_123',
            therapistId: '',
            appointmentId: 'appt_789',
          },
          clock,
        ),
      ).toThrow('Therapist ID cannot be empty.');
    });

    it('should throw an error if appointmentId is empty or whitespace', () => {
      expect(() =>
        TreatmentSession.create(
          {
            clientId: 'client_123',
            therapistId: 'therapist_456',
            appointmentId: '',
          },
          clock,
        ),
      ).toThrow('Appointment ID cannot be empty.');
    });
  });

  describe('Lifecycle State Machine — Valid Transitions', () => {
    it('should transition SCHEDULED -> IN_PROGRESS via start()', () => {
      const session = createDefaultSession();
      const startTime = new Date('2026-08-15T14:05:00.000Z');
      clock.setTime(startTime);

      session.start(clock);

      expect(session.status).toBe(SessionStatus.IN_PROGRESS);
      expect(session.updatedAt).toEqual(startTime);
    });

    it('should transition IN_PROGRESS -> COMPLETED via complete()', () => {
      const session = createDefaultSession();
      clock.advanceMinutes(5);
      session.start(clock);

      const completeTime = new Date('2026-08-15T14:55:00.000Z');
      clock.setTime(completeTime);
      session.complete(clock);

      expect(session.status).toBe(SessionStatus.COMPLETED);
      expect(session.updatedAt).toEqual(completeTime);
    });

    it('should transition SCHEDULED -> CANCELLED via cancel() with reason', () => {
      const session = createDefaultSession();
      const cancelTime = new Date('2026-08-15T14:10:00.000Z');
      clock.setTime(cancelTime);

      session.cancel('Client called with emergency', clock);

      expect(session.status).toBe(SessionStatus.CANCELLED);
      expect(session.cancellationReason).toBe('Client called with emergency');
      expect(session.updatedAt).toEqual(cancelTime);
    });

    it('should transition SCHEDULED -> NO_SHOW via markAsNoShow()', () => {
      const session = createDefaultSession();
      const noShowTime = new Date('2026-08-15T14:30:00.000Z');
      clock.setTime(noShowTime);

      session.markAsNoShow(clock);

      expect(session.status).toBe(SessionStatus.NO_SHOW);
      expect(session.updatedAt).toEqual(noShowTime);
    });
  });

  describe('Lifecycle State Machine — Invalid Transitions', () => {
    it('should reject direct transition SCHEDULED -> COMPLETED', () => {
      const session = createDefaultSession();

      expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
      expect(() => session.complete(clock)).toThrow(
        "Cannot transition TreatmentSession from 'SCHEDULED' to 'COMPLETED'.",
      );
      expect(session.status).toBe(SessionStatus.SCHEDULED);
    });

    it('should reject transitions from IN_PROGRESS to SCHEDULED, CANCELLED, or NO_SHOW', () => {
      const session = createDefaultSession();
      session.start(clock);

      expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
      expect(() => session.cancel('Late cancel', clock)).toThrow(InvalidSessionTransitionException);
      expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
      expect(session.status).toBe(SessionStatus.IN_PROGRESS);
    });

    describe('Terminal State Immutability', () => {
      it('should reject all further transitions once COMPLETED', () => {
        const session = createDefaultSession();
        session.start(clock);
        session.complete(clock);

        expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.cancel('Cannot cancel', clock)).toThrow(
          InvalidSessionTransitionException,
        );
        expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
        expect(session.status).toBe(SessionStatus.COMPLETED);
      });

      it('should reject all further transitions once CANCELLED', () => {
        const session = createDefaultSession();
        session.cancel('Cancelled by clinic', clock);

        expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.cancel('Already cancelled', clock)).toThrow(
          InvalidSessionTransitionException,
        );
        expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
        expect(session.status).toBe(SessionStatus.CANCELLED);
      });

      it('should reject all further transitions once NO_SHOW', () => {
        const session = createDefaultSession();
        session.markAsNoShow(clock);

        expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.cancel('Too late', clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
        expect(session.status).toBe(SessionStatus.NO_SHOW);
      });
    });
  });

  describe('Notes Management & Guard Rules', () => {
    it('should allow updating notes during SCHEDULED and IN_PROGRESS states', () => {
      const session = createDefaultSession();
      const newNotes = SessionNotes.create({
        subjective: 'Neck pain after lifting.',
      });

      session.updateNotes(newNotes, clock);
      expect(session.notes.getSubjective()).toBe('Neck pain after lifting.');

      session.start(clock);
      const inProgressNotes = SessionNotes.create({
        subjective: 'Neck pain',
        objective: 'Cervical rotation limited to 45 deg',
      });
      session.updateNotes(inProgressNotes, clock);
      expect(session.notes.getObjective()).toBe('Cervical rotation limited to 45 deg');
    });

    it('should reject updating notes if session is CANCELLED or NO_SHOW', () => {
      const session = createDefaultSession();
      session.cancel('Cancelled', clock);

      expect(() => session.updateNotes(SessionNotes.create('Notes'), clock)).toThrow(
        "Cannot update clinical notes for a session in 'CANCELLED' status.",
      );

      const noShowSession = createDefaultSession();
      noShowSession.markAsNoShow(clock);
      expect(() => noShowSession.updateNotes(SessionNotes.create('Notes'), clock)).toThrow(
        "Cannot update clinical notes for a session in 'NO_SHOW' status.",
      );
    });
  });

  describe('Reconstitution', () => {
    it('should reconstitute an existing TreatmentSession aggregate from persistence state', () => {
      const sessionId = SessionId.create('sess_existing_123');
      const session = TreatmentSession.reconstitute({
        id: sessionId,
        version: 3,
        status: SessionStatus.IN_PROGRESS,
        clientId: 'client_abc',
        therapistId: 'therapist_xyz',
        appointmentId: 'appt_correlate',
        cancellationReason: undefined,
        notes: SessionNotes.create({ subjective: 'Shoulder tightness' }),
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-01T10:30:00.000Z'),
      });

      expect(session.id.getValue()).toBe('sess_existing_123');
      expect(session.version).toBe(3);
      expect(session.status).toBe(SessionStatus.IN_PROGRESS);
      expect(session.clientId).toBe('client_abc');
      expect(session.therapistId).toBe('therapist_xyz');
      expect(session.appointmentId).toBe('appt_correlate');
      expect(session.notes.getSubjective()).toBe('Shoulder tightness');
    });

    it('should throw an error if reconstituted without a valid SessionId', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          // @ts-expect-error - Testing runtime safety
          id: null,
          version: 1,
          status: SessionStatus.SCHEDULED,
          clientId: 'client_abc',
          therapistId: 'therapist_xyz',
          appointmentId: 'appt_123',
          notes: SessionNotes.empty(),
          createdAt: initialDate,
          updatedAt: initialDate,
        }),
      ).toThrow('Session ID cannot be empty.');
    });

    it('should throw an error if reconstituted version is less than 1', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_invalid'),
          version: 0,
          status: SessionStatus.SCHEDULED,
          clientId: 'client_abc',
          therapistId: 'therapist_xyz',
          appointmentId: 'appt_123',
          notes: SessionNotes.empty(),
          createdAt: initialDate,
          updatedAt: initialDate,
        }),
      ).toThrow('Aggregate version must be greater than or equal to 1.');
    });

    it('should throw an error if reconstituted with invalid SessionStatus', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_invalid_status'),
          version: 1,
          // @ts-expect-error - Testing runtime validation
          status: 'INVALID_STATUS',
          clientId: 'client_abc',
          therapistId: 'therapist_xyz',
          appointmentId: 'appt_123',
          notes: SessionNotes.empty(),
          createdAt: initialDate,
          updatedAt: initialDate,
        }),
      ).toThrow("Invalid SessionStatus: 'INVALID_STATUS'.");
    });
  });
});
