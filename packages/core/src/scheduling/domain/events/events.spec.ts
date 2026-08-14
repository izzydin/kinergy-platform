import { AppointmentCreatedEvent } from './appointment-created.event';
import { AppointmentCancelledEvent } from './appointment-cancelled.event';
import { AppointmentRescheduledEvent } from './appointment-rescheduled.event';
import { TherapistAssignedEvent } from './therapist-assigned.event';
import { RoomAssignedEvent } from './room-assigned.event';
import { RoomCreatedEvent } from './room-created.event';
import { RoomActivatedEvent } from './room-activated.event';
import { RoomDeactivatedEvent } from './room-deactivated.event';
import { RoomMarkedMaintenanceEvent } from './room-maintenance.event';
import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { TimeRange } from '../value-objects/time-range.vo';

describe('Domain Events Infrastructure', () => {
  const apptType = AppointmentType.create(AppointmentTypeEnum.ASSESSMENT);
  const timeRange = TimeRange.create(
    new Date('2026-08-03T10:00:00.000Z'),
    new Date('2026-08-03T11:00:00.000Z'),
  );

  it('should create immutable AppointmentCreatedEvent with metadata', () => {
    const event = new AppointmentCreatedEvent(
      'appt_1',
      'client_1',
      'therapist_1',
      'room_1',
      apptType,
      timeRange,
      2,
    );

    expect(event.eventId).toMatch(/^evt_/);
    expect(event.name).toBe('AppointmentCreated');
    expect(event.aggregateId).toBe('appt_1');
    expect(event.version).toBe(2);
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('should create immutable AppointmentCancelledEvent', () => {
    const event = new AppointmentCancelledEvent('appt_1', 'Client request', 3);

    expect(event.name).toBe('AppointmentCancelled');
    expect(event.aggregateId).toBe('appt_1');
    expect(event.reason).toBe('Client request');
    expect(event.version).toBe(3);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('should create immutable AppointmentRescheduledEvent', () => {
    const oldTimeRange = TimeRange.create(
      new Date('2026-08-03T09:00:00.000Z'),
      new Date('2026-08-03T10:00:00.000Z'),
    );
    const event = new AppointmentRescheduledEvent('appt_1', oldTimeRange, timeRange, 4);

    expect(event.name).toBe('AppointmentRescheduled');
    expect(event.newTimeRange).toBe(timeRange);
    expect(event.version).toBe(4);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('should create immutable TherapistAssignedEvent and RoomAssignedEvent', () => {
    const therapistEvent = new TherapistAssignedEvent('appt_1', 'therapist_1', 'therapist_2', 5);
    const roomEvent = new RoomAssignedEvent('appt_1', 'room_1', 'room_2', 6);

    expect(therapistEvent.therapistId).toBe('therapist_2');
    expect(therapistEvent.version).toBe(5);
    expect(roomEvent.roomId).toBe('room_2');
    expect(roomEvent.version).toBe(6);

    expect(Object.isFrozen(therapistEvent)).toBe(true);
    expect(Object.isFrozen(roomEvent)).toBe(true);
  });

  it('should create immutable RoomCreatedEvent, RoomActivatedEvent, RoomDeactivatedEvent, and RoomMarkedMaintenanceEvent', () => {
    const createdEvent = new RoomCreatedEvent('room_1', 'Studio A', 3, ['tub'], 1);
    const activatedEvent = new RoomActivatedEvent('room_1', 2);
    const deactivatedEvent = new RoomDeactivatedEvent('room_1', 3, 'Maintenance');
    const maintenanceEvent = new RoomMarkedMaintenanceEvent('room_1', 4, 'Cleaning');

    expect(createdEvent.name).toBe('RoomCreated');
    expect(createdEvent.roomId).toBe('room_1');
    expect(createdEvent.payload.capacity).toBe(3);

    expect(activatedEvent.name).toBe('RoomActivated');
    expect(activatedEvent.roomId).toBe('room_1');

    expect(deactivatedEvent.name).toBe('RoomDeactivated');
    expect(deactivatedEvent.payload.reason).toBe('Maintenance');

    expect(maintenanceEvent.name).toBe('RoomMarkedMaintenance');
    expect(maintenanceEvent.payload.reason).toBe('Cleaning');

    expect(Object.isFrozen(createdEvent)).toBe(true);
    expect(Object.isFrozen(activatedEvent)).toBe(true);
    expect(Object.isFrozen(deactivatedEvent)).toBe(true);
    expect(Object.isFrozen(maintenanceEvent)).toBe(true);
  });
});
