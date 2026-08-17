import { TreatmentSession } from './treatment-session.aggregate';
import { SessionId } from './session-id.vo';
import { SessionStatus } from './session-status.enum';
import { SessionNotes } from './session-notes.vo';
import { TestClock } from '../shared/clock';
import { InvalidSessionTransitionException } from '../exceptions/invalid-session-transition.exception';
import {
  TreatmentSessionCreatedEvent,
  TreatmentSessionStartedEvent,
  TreatmentSessionCompletedEvent,
  TreatmentSessionCancelledEvent,
  TreatmentSessionNoShowEvent,
  TreatmentSessionNotesUpdatedEvent,
  TherapistAssignedToSessionEvent,
} from '../events';

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

  describe('Creation & Identity Invariants', () => {
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
      expect(session.getUncommittedEvents()).toHaveLength(1);
      expect(session.getUncommittedEvents()[0]).toBeInstanceOf(TreatmentSessionCreatedEvent);
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

      expect(() =>
        TreatmentSession.create(
          {
            clientId: 'client_123',
            therapistId: '   ',
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

      expect(() =>
        TreatmentSession.create(
          {
            clientId: 'client_123',
            therapistId: 'therapist_456',
            appointmentId: '   ',
          },
          clock,
        ),
      ).toThrow('Appointment ID cannot be empty.');
    });
  });

  describe('Encapsulation & Immutability Protection', () => {
    it('should protect timestamps against external date mutation via defensive copies', () => {
      const session = createDefaultSession();
      const createdDate = session.createdAt;
      const updatedDate = session.updatedAt;

      createdDate.setFullYear(1990);
      updatedDate.setFullYear(1990);

      expect(session.createdAt.getFullYear()).toBe(2026);
      expect(session.updatedAt.getFullYear()).toBe(2026);
    });
  });

  describe('Domain Transition API — Operation Specific Invariants', () => {
    describe('start()', () => {
      it('should transition SCHEDULED -> IN_PROGRESS and update timestamp', () => {
        const session = createDefaultSession();
        const startTime = new Date('2026-08-15T14:05:00.000Z');
        clock.setTime(startTime);

        session.start(clock);

        expect(session.status).toBe(SessionStatus.IN_PROGRESS);
        expect(session.updatedAt).toEqual(startTime);
      });

      it('should reject start() from IN_PROGRESS', () => {
        const session = createDefaultSession();
        session.start(clock);

        expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject start() from COMPLETED', () => {
        const session = createDefaultSession();
        session.start(clock);
        session.complete(clock);

        expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject start() from CANCELLED', () => {
        const session = createDefaultSession();
        session.cancel('Cancelled', clock);

        expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject start() from NO_SHOW', () => {
        const session = createDefaultSession();
        session.markAsNoShow(clock);

        expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);
      });
    });

    describe('complete()', () => {
      it('should transition IN_PROGRESS -> COMPLETED and update timestamp', () => {
        const session = createDefaultSession();
        clock.advanceMinutes(5);
        session.start(clock);

        const completeTime = new Date('2026-08-15T14:55:00.000Z');
        clock.setTime(completeTime);
        session.complete(clock);

        expect(session.status).toBe(SessionStatus.COMPLETED);
        expect(session.updatedAt).toEqual(completeTime);
      });

      it('should reject direct complete() from SCHEDULED (critical invariant)', () => {
        const session = createDefaultSession();

        expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
        expect(() => session.complete(clock)).toThrow(
          "Cannot transition TreatmentSession from 'SCHEDULED' to 'COMPLETED'.",
        );
        expect(session.status).toBe(SessionStatus.SCHEDULED);
      });

      it('should reject complete() from COMPLETED', () => {
        const session = createDefaultSession();
        session.start(clock);
        session.complete(clock);

        expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject complete() from CANCELLED', () => {
        const session = createDefaultSession();
        session.cancel('Cancelled', clock);

        expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject complete() from NO_SHOW', () => {
        const session = createDefaultSession();
        session.markAsNoShow(clock);

        expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);
      });
    });

    describe('cancel()', () => {
      it('should transition SCHEDULED -> CANCELLED with reason and update timestamp', () => {
        const session = createDefaultSession();
        const cancelTime = new Date('2026-08-15T14:10:00.000Z');
        clock.setTime(cancelTime);

        session.cancel('Client requested cancellation', clock);

        expect(session.status).toBe(SessionStatus.CANCELLED);
        expect(session.cancellationReason).toBe('Client requested cancellation');
        expect(session.updatedAt).toEqual(cancelTime);
      });

      it('should reject cancel() from IN_PROGRESS', () => {
        const session = createDefaultSession();
        session.start(clock);

        expect(() => session.cancel('Late cancel', clock)).toThrow(
          InvalidSessionTransitionException,
        );
      });

      it('should reject cancel() from COMPLETED', () => {
        const session = createDefaultSession();
        session.start(clock);
        session.complete(clock);

        expect(() => session.cancel('Post cancel', clock)).toThrow(
          InvalidSessionTransitionException,
        );
      });

      it('should reject cancel() from CANCELLED', () => {
        const session = createDefaultSession();
        session.cancel('First cancel', clock);

        expect(() => session.cancel('Second cancel', clock)).toThrow(
          InvalidSessionTransitionException,
        );
      });

      it('should reject cancel() from NO_SHOW', () => {
        const session = createDefaultSession();
        session.markAsNoShow(clock);

        expect(() => session.cancel('Cancel after no-show', clock)).toThrow(
          InvalidSessionTransitionException,
        );
      });
    });

    describe('markAsNoShow()', () => {
      it('should transition SCHEDULED -> NO_SHOW and update timestamp', () => {
        const session = createDefaultSession();
        const noShowTime = new Date('2026-08-15T14:30:00.000Z');
        clock.setTime(noShowTime);

        session.markAsNoShow(clock);

        expect(session.status).toBe(SessionStatus.NO_SHOW);
        expect(session.updatedAt).toEqual(noShowTime);
      });

      it('should reject markAsNoShow() from IN_PROGRESS', () => {
        const session = createDefaultSession();
        session.start(clock);

        expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject markAsNoShow() from COMPLETED', () => {
        const session = createDefaultSession();
        session.start(clock);
        session.complete(clock);

        expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject markAsNoShow() from CANCELLED', () => {
        const session = createDefaultSession();
        session.cancel('Cancelled', clock);

        expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
      });

      it('should reject markAsNoShow() from NO_SHOW', () => {
        const session = createDefaultSession();
        session.markAsNoShow(clock);

        expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);
      });
    });
  });

  describe('SessionNotes Invariants & Mutation', () => {
    it('should allow updating notes during SCHEDULED, IN_PROGRESS, and COMPLETED states', () => {
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

      session.complete(clock);
      const postSessionNotes = SessionNotes.create({
        subjective: 'Neck pain',
        objective: 'Cervical rotation limited to 45 deg',
        assessment: 'Post-treatment improvement observed',
        plan: 'Follow up in 1 week',
      });
      session.updateNotes(postSessionNotes, clock);
      expect(session.notes.getPlan()).toBe('Follow up in 1 week');
    });

    it('should throw an error if updating notes with null or undefined', () => {
      const session = createDefaultSession();
      expect(() =>
        // @ts-expect-error - Testing runtime safety
        session.updateNotes(null, clock),
      ).toThrow('Session notes cannot be null or undefined.');
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

  describe('State & Timestamp Preservation on Transition Failures', () => {
    it('should maintain exact status and updatedAt timestamp when start() fails', () => {
      const session = createDefaultSession();
      session.start(clock);
      const afterStartTime = session.updatedAt;

      clock.advanceMinutes(10);
      expect(() => session.start(clock)).toThrow(InvalidSessionTransitionException);

      expect(session.status).toBe(SessionStatus.IN_PROGRESS);
      expect(session.updatedAt).toEqual(afterStartTime);
    });

    it('should maintain exact status and updatedAt timestamp when complete() fails on SCHEDULED', () => {
      const session = createDefaultSession();

      clock.advanceMinutes(10);
      expect(() => session.complete(clock)).toThrow(InvalidSessionTransitionException);

      expect(session.status).toBe(SessionStatus.SCHEDULED);
      expect(session.updatedAt).toEqual(initialDate);
    });

    it('should maintain exact status and updatedAt timestamp when cancel() fails on COMPLETED', () => {
      const session = createDefaultSession();
      session.start(clock);
      session.complete(clock);
      const completedTime = session.updatedAt;

      clock.advanceMinutes(10);
      expect(() => session.cancel('Late cancel', clock)).toThrow(InvalidSessionTransitionException);

      expect(session.status).toBe(SessionStatus.COMPLETED);
      expect(session.updatedAt).toEqual(completedTime);
    });

    it('should maintain exact status and updatedAt timestamp when markAsNoShow() fails on CANCELLED', () => {
      const session = createDefaultSession();
      session.cancel('Cancelled by clinic', clock);
      const cancelledTime = session.updatedAt;

      clock.advanceMinutes(10);
      expect(() => session.markAsNoShow(clock)).toThrow(InvalidSessionTransitionException);

      expect(session.status).toBe(SessionStatus.CANCELLED);
      expect(session.updatedAt).toEqual(cancelledTime);
    });
  });

  describe('Adversarial Invariant & Integrity Attacks', () => {
    it('should reject external tampering with uncommitted domain events array', () => {
      const session = createDefaultSession();
      const events = session.getUncommittedEvents();

      // Attempting to push to the array should not corrupt internal aggregate state
      (events as unknown[]).push({ eventName: 'HACKED_EVENT' });
      expect(session.getUncommittedEvents().length).toBe(1);
      expect(session.getUncommittedEvents()[0]).toBeInstanceOf(TreatmentSessionCreatedEvent);
    });

    it('should sanitize whitespace-only cancellation reasons to undefined', () => {
      const session = createDefaultSession();
      session.cancel('   ', clock);

      expect(session.status).toBe(SessionStatus.CANCELLED);
      expect(session.cancellationReason).toBeUndefined();
    });

    it('should reject reconstitution with empty clientId', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_123'),
          version: 1,
          status: SessionStatus.SCHEDULED,
          clientId: '   ',
          therapistId: 'therapist_xyz',
          appointmentId: 'appt_123',
          notes: SessionNotes.empty(),
          createdAt: initialDate,
          updatedAt: initialDate,
        }),
      ).toThrow('Client ID cannot be empty.');
    });

    it('should reject reconstitution with empty therapistId', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_123'),
          version: 1,
          status: SessionStatus.SCHEDULED,
          clientId: 'client_123',
          therapistId: '   ',
          appointmentId: 'appt_123',
          notes: SessionNotes.empty(),
          createdAt: initialDate,
          updatedAt: initialDate,
        }),
      ).toThrow('Therapist ID cannot be empty.');
    });

    it('should reject reconstitution with empty appointmentId', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_123'),
          version: 1,
          status: SessionStatus.SCHEDULED,
          clientId: 'client_123',
          therapistId: 'therapist_xyz',
          appointmentId: '   ',
          notes: SessionNotes.empty(),
          createdAt: initialDate,
          updatedAt: initialDate,
        }),
      ).toThrow('Appointment ID cannot be empty.');
    });

    it('should reject reconstitution with null notes', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_123'),
          version: 1,
          status: SessionStatus.SCHEDULED,
          clientId: 'client_123',
          therapistId: 'therapist_xyz',
          appointmentId: 'appt_123',
          // @ts-expect-error - Testing runtime safety
          notes: null,
          createdAt: initialDate,
          updatedAt: initialDate,
        }),
      ).toThrow('Session notes cannot be null or undefined.');
    });

    it('should protect Value Objects from property mutation (Object.freeze integrity)', () => {
      const notes = SessionNotes.create({ subjective: 'Original' });
      expect(Object.isFrozen(notes)).toBe(true);

      const sessionId = SessionId.create('sess_orig');
      expect(Object.isFrozen(sessionId)).toBe(true);
    });
  });

  describe('Comprehensive 20-Cell State Transition Matrix (Parameterized)', () => {
    type TransitionOperation = 'start' | 'complete' | 'cancel' | 'markAsNoShow';

    interface MatrixCase {
      initialStatus: SessionStatus;
      operation: TransitionOperation;
      isValid: boolean;
      resultingStatus: SessionStatus;
    }

    const matrixTestCases: MatrixCase[] = [
      // SCHEDULED
      {
        initialStatus: SessionStatus.SCHEDULED,
        operation: 'start',
        isValid: true,
        resultingStatus: SessionStatus.IN_PROGRESS,
      },
      {
        initialStatus: SessionStatus.SCHEDULED,
        operation: 'complete',
        isValid: false,
        resultingStatus: SessionStatus.SCHEDULED,
      },
      {
        initialStatus: SessionStatus.SCHEDULED,
        operation: 'cancel',
        isValid: true,
        resultingStatus: SessionStatus.CANCELLED,
      },
      {
        initialStatus: SessionStatus.SCHEDULED,
        operation: 'markAsNoShow',
        isValid: true,
        resultingStatus: SessionStatus.NO_SHOW,
      },

      // IN_PROGRESS
      {
        initialStatus: SessionStatus.IN_PROGRESS,
        operation: 'start',
        isValid: false,
        resultingStatus: SessionStatus.IN_PROGRESS,
      },
      {
        initialStatus: SessionStatus.IN_PROGRESS,
        operation: 'complete',
        isValid: true,
        resultingStatus: SessionStatus.COMPLETED,
      },
      {
        initialStatus: SessionStatus.IN_PROGRESS,
        operation: 'cancel',
        isValid: false,
        resultingStatus: SessionStatus.IN_PROGRESS,
      },
      {
        initialStatus: SessionStatus.IN_PROGRESS,
        operation: 'markAsNoShow',
        isValid: false,
        resultingStatus: SessionStatus.IN_PROGRESS,
      },

      // COMPLETED (Terminal)
      {
        initialStatus: SessionStatus.COMPLETED,
        operation: 'start',
        isValid: false,
        resultingStatus: SessionStatus.COMPLETED,
      },
      {
        initialStatus: SessionStatus.COMPLETED,
        operation: 'complete',
        isValid: false,
        resultingStatus: SessionStatus.COMPLETED,
      },
      {
        initialStatus: SessionStatus.COMPLETED,
        operation: 'cancel',
        isValid: false,
        resultingStatus: SessionStatus.COMPLETED,
      },
      {
        initialStatus: SessionStatus.COMPLETED,
        operation: 'markAsNoShow',
        isValid: false,
        resultingStatus: SessionStatus.COMPLETED,
      },

      // CANCELLED (Terminal)
      {
        initialStatus: SessionStatus.CANCELLED,
        operation: 'start',
        isValid: false,
        resultingStatus: SessionStatus.CANCELLED,
      },
      {
        initialStatus: SessionStatus.CANCELLED,
        operation: 'complete',
        isValid: false,
        resultingStatus: SessionStatus.CANCELLED,
      },
      {
        initialStatus: SessionStatus.CANCELLED,
        operation: 'cancel',
        isValid: false,
        resultingStatus: SessionStatus.CANCELLED,
      },
      {
        initialStatus: SessionStatus.CANCELLED,
        operation: 'markAsNoShow',
        isValid: false,
        resultingStatus: SessionStatus.CANCELLED,
      },

      // NO_SHOW (Terminal)
      {
        initialStatus: SessionStatus.NO_SHOW,
        operation: 'start',
        isValid: false,
        resultingStatus: SessionStatus.NO_SHOW,
      },
      {
        initialStatus: SessionStatus.NO_SHOW,
        operation: 'complete',
        isValid: false,
        resultingStatus: SessionStatus.NO_SHOW,
      },
      {
        initialStatus: SessionStatus.NO_SHOW,
        operation: 'cancel',
        isValid: false,
        resultingStatus: SessionStatus.NO_SHOW,
      },
      {
        initialStatus: SessionStatus.NO_SHOW,
        operation: 'markAsNoShow',
        isValid: false,
        resultingStatus: SessionStatus.NO_SHOW,
      },
    ];

    const createSessionInStatus = (status: SessionStatus): TreatmentSession => {
      return TreatmentSession.reconstitute({
        id: SessionId.create('sess_matrix_test'),
        version: 1,
        status,
        clientId: 'client_100',
        therapistId: 'therapist_200',
        appointmentId: 'appt_300',
        cancellationReason: status === SessionStatus.CANCELLED ? 'Prior reason' : undefined,
        notes: SessionNotes.empty(),
        createdAt: initialDate,
        updatedAt: initialDate,
      });
    };

    test.each(matrixTestCases)(
      'from $initialStatus invoking $operation() (allowed: $isValid) -> status: $resultingStatus',
      ({ initialStatus, operation, isValid, resultingStatus }) => {
        const session = createSessionInStatus(initialStatus);
        const executeOp = () => {
          switch (operation) {
            case 'start':
              session.start(clock);
              break;
            case 'complete':
              session.complete(clock);
              break;
            case 'cancel':
              session.cancel('Cancelled in matrix test', clock);
              break;
            case 'markAsNoShow':
              session.markAsNoShow(clock);
              break;
          }
        };

        if (isValid) {
          expect(executeOp).not.toThrow();
          expect(session.status).toBe(resultingStatus);
        } else {
          expect(executeOp).toThrow(InvalidSessionTransitionException);
          // Failure atomicity: status remains initial state
          expect(session.status).toBe(resultingStatus);
        }
      },
    );
  });

  describe('Therapist Reassignment', () => {
    it('should allow reassigning therapist in SCHEDULED status and record TherapistAssignedEvent', () => {
      const session = createDefaultSession();
      session.clearEvents();

      clock.advanceMinutes(5);
      session.assignTherapist('therapist_new_999', clock);

      expect(session.therapistId).toBe('therapist_new_999');
      expect(session.version).toBe(2);
      expect(session.updatedAt).toEqual(clock.now());

      const events = session.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TherapistAssignedToSessionEvent);
      const event = events[0] as unknown as TherapistAssignedToSessionEvent;
      expect(event.payload.previousTherapistId).toBe('therapist_456');
      expect(event.payload.newTherapistId).toBe('therapist_new_999');
      expect(event.version).toBe(2);
    });

    it('should allow reassigning therapist in IN_PROGRESS status', () => {
      const session = createDefaultSession();
      session.start(clock);
      session.clearEvents();

      clock.advanceMinutes(5);
      session.assignTherapist('therapist_substitute', clock);

      expect(session.therapistId).toBe('therapist_substitute');
      expect(session.version).toBe(3);
    });

    it('should reject therapist reassignment with empty string', () => {
      const session = createDefaultSession();
      expect(() => session.assignTherapist('')).toThrow('Therapist ID cannot be empty.');
      expect(() => session.assignTherapist('   ')).toThrow('Therapist ID cannot be empty.');
    });

    it('should reject therapist reassignment in terminal statuses', () => {
      const completedSession = createDefaultSession();
      completedSession.start(clock);
      completedSession.complete(clock);
      expect(() => completedSession.assignTherapist('therapist_new', clock)).toThrow(
        "Cannot reassign therapist for a session in 'COMPLETED' terminal status.",
      );

      const cancelledSession = createDefaultSession();
      cancelledSession.cancel('Cancelled', clock);
      expect(() => cancelledSession.assignTherapist('therapist_new', clock)).toThrow(
        "Cannot reassign therapist for a session in 'CANCELLED' terminal status.",
      );

      const noShowSession = createDefaultSession();
      noShowSession.markAsNoShow(clock);
      expect(() => noShowSession.assignTherapist('therapist_new', clock)).toThrow(
        "Cannot reassign therapist for a session in 'NO_SHOW' terminal status.",
      );
    });
  });

  describe('Domain Event Emission Lifecycle', () => {
    it('should emit TreatmentSessionStartedEvent on start()', () => {
      const session = createDefaultSession();
      session.clearEvents();

      clock.advanceMinutes(15);
      session.start(clock);

      const events = session.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TreatmentSessionStartedEvent);
      const event = events[0] as unknown as TreatmentSessionStartedEvent;
      expect(event.payload.sessionId).toBe(session.id.getValue());
      expect(event.payload.startedAt).toEqual(clock.now());
      expect(event.version).toBe(2);
    });

    it('should emit TreatmentSessionCompletedEvent on complete()', () => {
      const session = createDefaultSession();
      session.start(clock);
      session.clearEvents();

      clock.advanceMinutes(45);
      session.complete(clock);

      const events = session.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TreatmentSessionCompletedEvent);
      const event = events[0] as unknown as TreatmentSessionCompletedEvent;
      expect(event.payload.sessionId).toBe(session.id.getValue());
      expect(event.payload.completedAt).toEqual(clock.now());
      expect(event.version).toBe(3);
    });

    it('should emit TreatmentSessionCancelledEvent on cancel()', () => {
      const session = createDefaultSession();
      session.clearEvents();

      clock.advanceMinutes(10);
      session.cancel('Client requested reschedule', clock);

      const events = session.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TreatmentSessionCancelledEvent);
      const event = events[0] as unknown as TreatmentSessionCancelledEvent;
      expect(event.payload.reason).toBe('Client requested reschedule');
      expect(event.version).toBe(2);
    });

    it('should emit TreatmentSessionNoShowEvent on markAsNoShow()', () => {
      const session = createDefaultSession();
      session.clearEvents();

      clock.advanceMinutes(30);
      session.markAsNoShow(clock);

      const events = session.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TreatmentSessionNoShowEvent);
      const event = events[0] as unknown as TreatmentSessionNoShowEvent;
      expect(event.payload.sessionId).toBe(session.id.getValue());
      expect(event.version).toBe(2);
    });

    it('should emit TreatmentSessionNotesUpdatedEvent on updateNotes()', () => {
      const session = createDefaultSession();
      session.clearEvents();

      clock.advanceMinutes(5);
      session.updateNotes(SessionNotes.create({ subjective: 'Improved range' }), clock);

      const events = session.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TreatmentSessionNotesUpdatedEvent);
      const event = events[0] as unknown as TreatmentSessionNotesUpdatedEvent;
      expect(event.payload.sessionId).toBe(session.id.getValue());
      expect(event.version).toBe(2);
    });

    it('should clear uncommitted events via clearEvents()', () => {
      const session = createDefaultSession();
      expect(session.getUncommittedEvents().length).toBe(1);

      session.clearEvents();
      expect(session.getUncommittedEvents().length).toBe(0);
    });
  });
});
