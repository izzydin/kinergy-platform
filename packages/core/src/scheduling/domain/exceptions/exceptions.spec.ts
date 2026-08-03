import { SchedulingDomainException } from './scheduling.exception';
import { TherapistUnavailableException } from './therapist-unavailable.exception';
import { RoomUnavailableException } from './room-unavailable.exception';
import { ClientUnavailableException } from './client-unavailable.exception';
import { AppointmentConflictException } from './appointment-conflict.exception';
import { WorkingHoursViolationException } from './working-hours-violation.exception';
import { BookingWindowViolationException } from './booking-window-violation.exception';
import { InvalidAppointmentTransitionException } from './invalid-appointment-transition.exception';
import { SchedulingConflict } from '../value-objects/scheduling-conflict.vo';
import { TimeRange } from '../value-objects/time-range.vo';

describe('Domain Exceptions Hierarchy', () => {
  const timeRange = TimeRange.create(
    new Date('2026-08-03T10:00:00.000Z'),
    new Date('2026-08-03T11:00:00.000Z'),
  );

  it('should inherit from SchedulingDomainException and set error code', () => {
    const ex = new TherapistUnavailableException('therapist_100');

    expect(ex).toBeInstanceOf(SchedulingDomainException);
    expect(ex).toBeInstanceOf(Error);
    expect(ex.code).toBe('THERAPIST_UNAVAILABLE');
    expect(ex.therapistId).toBe('therapist_100');
    expect(ex.message).toContain('therapist_100');
  });

  it('should format RoomUnavailableException and ClientUnavailableException', () => {
    const roomEx = new RoomUnavailableException('room_1');
    const clientEx = new ClientUnavailableException('client_1');

    expect(roomEx.code).toBe('ROOM_UNAVAILABLE');
    expect(clientEx.code).toBe('CLIENT_UNAVAILABLE');
  });

  it('should carry structured conflicts in AppointmentConflictException', () => {
    const conflict = SchedulingConflict.create({
      conflictType: 'THERAPIST',
      conflictingEntityId: 'therapist_1',
      requestedRange: timeRange,
      reason: 'Double booking',
    });

    const ex = new AppointmentConflictException([conflict]);

    expect(ex.code).toBe('APPOINTMENT_CONFLICT');
    expect(ex.conflicts).toHaveLength(1);
    expect(ex.conflicts[0]).toBe(conflict);
    expect(Object.isFrozen(ex.conflicts)).toBe(true);
  });

  it('should instantiate WorkingHoursViolationException and BookingWindowViolationException', () => {
    const workEx = new WorkingHoursViolationException();
    const windowEx = new BookingWindowViolationException();

    expect(workEx.code).toBe('WORKING_HOURS_VIOLATION');
    expect(windowEx.code).toBe('BOOKING_WINDOW_VIOLATION');
  });

  it('should format InvalidAppointmentTransitionException', () => {
    const transitionEx = new InvalidAppointmentTransitionException('SCHEDULED', 'COMPLETED');

    expect(transitionEx.code).toBe('INVALID_APPOINTMENT_TRANSITION');
    expect(transitionEx.currentStatus).toBe('SCHEDULED');
    expect(transitionEx.targetStatus).toBe('COMPLETED');
  });
});
