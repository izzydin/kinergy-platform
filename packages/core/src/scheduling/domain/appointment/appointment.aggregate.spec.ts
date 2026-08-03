import { Appointment } from './appointment.aggregate';
import { AppointmentId } from './appointment-id.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { TimeRange } from '../value-objects/time-range.vo';
import { TestClock } from '../shared/clock';
import { InvalidAppointmentTransitionException } from '../exceptions/invalid-appointment-transition.exception';
import {
  AppointmentCreatedEvent,
  AppointmentCancelledEvent,
  AppointmentRescheduledEvent,
  RoomAssignedEvent,
  TherapistAssignedEvent,
} from '../events';

describe('Appointment Aggregate Root', () => {
  const clock = new TestClock(new Date('2026-08-03T10:00:00.000Z'));
  const initialTimeRange = TimeRange.create(
    new Date('2026-08-03T11:00:00.000Z'),
    new Date('2026-08-03T12:00:00.000Z'),
  );
  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);

  const createDefaultProps = () => ({
    clientId: 'client_100',
    therapistId: 'therapist_200',
    roomId: 'room_300',
    type: apptType,
    timeRange: initialTimeRange,
  });

  describe('Creation & Reconstitution', () => {
    it('should create a new Appointment aggregate with SCHEDULED status and version 1', () => {
      const appt = Appointment.create(createDefaultProps(), clock);

      expect(appt.id).toBeInstanceOf(AppointmentId);
      expect(appt.version).toBe(1);
      expect(appt.status).toBe(AppointmentStatus.SCHEDULED);
      expect(appt.clientId).toBe('client_100');
      expect(appt.therapistId).toBe('therapist_200');
      expect(appt.roomId).toBe('room_300');

      const events = appt.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AppointmentCreatedEvent);
    });

    it('should reconstitute an existing Appointment without generating uncommitted events', () => {
      const apptId = AppointmentId.create('appt_existing_123');
      const appt = Appointment.reconstitute({
        id: apptId,
        version: 5,
        status: AppointmentStatus.CONFIRMED,
        type: apptType,
        clientId: 'client_100',
        therapistId: 'therapist_200',
        roomId: 'room_300',
        timeRange: initialTimeRange,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      });

      expect(appt.id.getValue()).toBe('appt_existing_123');
      expect(appt.version).toBe(5);
      expect(appt.status).toBe(AppointmentStatus.CONFIRMED);
      expect(appt.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('Happy Path State Machine Flow', () => {
    it('should transition through SCHEDULED -> CONFIRMED -> CHECKED_IN -> IN_PROGRESS -> COMPLETED', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      expect(appt.version).toBe(1);

      // Confirm
      clock.advanceBy(60_000);
      appt.confirm(clock);
      expect(appt.status).toBe(AppointmentStatus.CONFIRMED);
      expect(appt.version).toBe(2);

      // Check In
      clock.advanceBy(60_000);
      appt.checkIn(clock);
      expect(appt.status).toBe(AppointmentStatus.CHECKED_IN);
      expect(appt.version).toBe(3);

      // Start
      clock.advanceBy(60_000);
      appt.start(clock);
      expect(appt.status).toBe(AppointmentStatus.IN_PROGRESS);
      expect(appt.version).toBe(4);

      // Complete
      clock.advanceBy(60_000);
      appt.complete(clock);
      expect(appt.status).toBe(AppointmentStatus.COMPLETED);
      expect(appt.version).toBe(5);
    });
  });

  describe('Illegal State Transitions', () => {
    it('should throw InvalidAppointmentTransitionException on invalid transitions', () => {
      const appt = Appointment.create(createDefaultProps(), clock);

      // Cannot check-in directly from SCHEDULED
      expect(() => appt.checkIn(clock)).toThrow(InvalidAppointmentTransitionException);

      // Cannot start directly from SCHEDULED
      expect(() => appt.start(clock)).toThrow(InvalidAppointmentTransitionException);

      // Cannot complete directly from SCHEDULED
      expect(() => appt.complete(clock)).toThrow(InvalidAppointmentTransitionException);
    });

    it('should throw InvalidAppointmentTransitionException when modifying COMPLETED appointment', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      appt.confirm(clock);
      appt.checkIn(clock);
      appt.start(clock);
      appt.complete(clock);

      expect(() => appt.confirm(clock)).toThrow(InvalidAppointmentTransitionException);
      expect(() => appt.cancel('Client request', clock)).toThrow(
        InvalidAppointmentTransitionException,
      );
      expect(() =>
        appt.reschedule(
          TimeRange.create(
            new Date('2026-08-04T10:00:00.000Z'),
            new Date('2026-08-04T11:00:00.000Z'),
          ),
          clock,
        ),
      ).toThrow(InvalidAppointmentTransitionException);
    });
  });

  describe('Cancellation', () => {
    it('should cancel appointment and emit AppointmentCancelledEvent', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      appt.pullEvents(); // clear creation event

      clock.advanceBy(300_000);
      appt.cancel('Client sick', clock);

      expect(appt.status).toBe(AppointmentStatus.CANCELLED);
      expect(appt.cancellationReason).toBe('Client sick');
      expect(appt.version).toBe(2);

      const events = appt.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AppointmentCancelledEvent);
      expect(events[0]!.payload).toMatchObject({
        reason: 'Client sick',
      });
    });

    it('should throw error when cancelling without reason', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      expect(() => appt.cancel('', clock)).toThrow();
    });
  });

  describe('Rescheduling', () => {
    it('should reschedule SCHEDULED appointment and emit AppointmentRescheduledEvent', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      appt.pullEvents();

      const newTimeRange = TimeRange.create(
        new Date('2026-08-04T14:00:00.000Z'),
        new Date('2026-08-04T15:00:00.000Z'),
      );

      clock.advanceBy(600_000);
      appt.reschedule(newTimeRange, clock);

      expect(appt.status).toBe(AppointmentStatus.RESCHEDULED);
      expect(appt.timeRange.equals(newTimeRange)).toBe(true);
      expect(appt.version).toBe(2);

      const events = appt.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AppointmentRescheduledEvent);
    });

    it('should throw InvalidAppointmentTransitionException when rescheduling IN_PROGRESS appointment', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      appt.confirm(clock);
      appt.checkIn(clock);
      appt.start(clock);

      const newTimeRange = TimeRange.create(
        new Date('2026-08-04T14:00:00.000Z'),
        new Date('2026-08-04T15:00:00.000Z'),
      );

      expect(() => appt.reschedule(newTimeRange, clock)).toThrow(
        InvalidAppointmentTransitionException,
      );
    });
  });

  describe('Room and Therapist Assignments', () => {
    it('should reassign room and emit RoomAssignedEvent', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      appt.pullEvents();

      appt.assignRoom('room_999', clock);

      expect(appt.roomId).toBe('room_999');
      expect(appt.version).toBe(2);

      const events = appt.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(RoomAssignedEvent);
      expect(events[0]!.payload).toMatchObject({
        oldRoomId: 'room_300',
        newRoomId: 'room_999',
      });
    });

    it('should reassign therapist and emit TherapistAssignedEvent', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      appt.pullEvents();

      appt.assignTherapist('therapist_888', clock);

      expect(appt.therapistId).toBe('therapist_888');
      expect(appt.version).toBe(2);

      const events = appt.pullEvents();
      expect(events).toBeInstanceOf(Array);
      expect(events[0]).toBeInstanceOf(TherapistAssignedEvent);
      expect(events[0]!.payload).toMatchObject({
        oldTherapistId: 'therapist_200',
        newTherapistId: 'therapist_888',
      });
    });

    it('should throw error when reassigning room or therapist for CANCELLED appointment', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      appt.cancel('Cancelled by clinic', clock);

      expect(() => appt.assignRoom('room_999', clock)).toThrow(
        InvalidAppointmentTransitionException,
      );
      expect(() => appt.assignTherapist('therapist_888', clock)).toThrow(
        InvalidAppointmentTransitionException,
      );
    });
  });

  describe('Event Pulling & Clearing', () => {
    it('should pull events and clear uncommitted store', () => {
      const appt = Appointment.create(createDefaultProps(), clock);
      expect(appt.getUncommittedEvents()).toHaveLength(1);

      const pulled = appt.pullEvents();
      expect(pulled).toHaveLength(1);
      expect(appt.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
