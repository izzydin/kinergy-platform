import { TreatmentSession } from './treatment-session.aggregate';
import { SessionId } from './session-id.vo';
import { SessionStatus } from './session-status.enum';
import { SessionNotes } from './session-notes.vo';
import { TestClock } from '../shared/clock';

describe('TreatmentSession Aggregate Root', () => {
  const fixedDate = new Date('2026-08-15T14:00:00.000Z');
  let clock: TestClock;

  beforeEach(() => {
    clock = new TestClock(fixedDate);
  });

  describe('Creation', () => {
    it('should create a new TreatmentSession in SCHEDULED status with version 1', () => {
      const session = TreatmentSession.create(
        {
          clientId: 'client_123',
          therapistId: 'therapist_456',
          appointmentId: 'appt_789',
          notes: SessionNotes.create('Initial consultation notes'),
        },
        clock,
      );

      expect(session.id).toBeDefined();
      expect(session.id.getValue().startsWith('sess_')).toBe(true);
      expect(session.version).toBe(1);
      expect(session.status).toBe(SessionStatus.SCHEDULED);
      expect(session.clientId).toBe('client_123');
      expect(session.therapistId).toBe('therapist_456');
      expect(session.appointmentId).toBe('appt_789');
      expect(session.notes.getRawText()).toBe('Initial consultation notes');
      expect(session.createdAt).toEqual(fixedDate);
      expect(session.updatedAt).toEqual(fixedDate);
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

  describe('Reconstitution & Encapsulation', () => {
    it('should reconstitute an existing TreatmentSession aggregate from persistence state', () => {
      const sessionId = SessionId.create('sess_existing_123');
      const session = TreatmentSession.reconstitute({
        id: sessionId,
        version: 3,
        status: SessionStatus.IN_PROGRESS,
        clientId: 'client_abc',
        therapistId: 'therapist_xyz',
        appointmentId: 'appt_correlate',
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
          createdAt: fixedDate,
          updatedAt: fixedDate,
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
          createdAt: fixedDate,
          updatedAt: fixedDate,
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
          createdAt: fixedDate,
          updatedAt: fixedDate,
        }),
      ).toThrow("Invalid SessionStatus: 'INVALID_STATUS'.");
    });

    it('should throw an error if reconstituted without session notes', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_no_notes'),
          version: 1,
          status: SessionStatus.SCHEDULED,
          clientId: 'client_abc',
          therapistId: 'therapist_xyz',
          appointmentId: 'appt_123',
          // @ts-expect-error - Testing runtime validation
          notes: null,
          createdAt: fixedDate,
          updatedAt: fixedDate,
        }),
      ).toThrow('Session notes cannot be null or undefined.');
    });

    it('should throw an error if reconstituted without timestamps', () => {
      expect(() =>
        TreatmentSession.reconstitute({
          id: SessionId.create('sess_no_ts'),
          version: 1,
          status: SessionStatus.SCHEDULED,
          clientId: 'client_abc',
          therapistId: 'therapist_xyz',
          appointmentId: 'appt_123',
          notes: SessionNotes.empty(),
          // @ts-expect-error - Testing runtime validation
          createdAt: null,
          updatedAt: fixedDate,
        }),
      ).toThrow('Session timestamps must be provided.');
    });
  });
});
