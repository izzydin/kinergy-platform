import { Room } from './room.aggregate';
import { RoomId } from './room-id.vo';
import { MaintenanceWindow } from './maintenance-window.vo';
import { RoomStatus } from '../value-objects/room-status.enum';
import { ResourceType } from '../resource/resource-type.enum';
import { RoomCreatedEvent } from '../events/room-created.event';
import { RoomActivatedEvent } from '../events/room-activated.event';
import { RoomDeactivatedEvent } from '../events/room-deactivated.event';
import { RoomMarkedMaintenanceEvent } from '../events/room-maintenance.event';
import { RoomMaintenanceScheduledEvent } from '../events/room-maintenance-scheduled.event';
import { RoomMaintenanceCancelledEvent } from '../events/room-maintenance-cancelled.event';
import { RoomAvailabilityEvaluator } from '../services/room-availability-evaluator.service';
import { TimeRange } from '../value-objects/time-range.vo';
import { Appointment } from '../appointment/appointment.aggregate';
import { AppointmentType } from '../value-objects/appointment-type.vo';

describe('Room Aggregate Root', () => {
  describe('Creation & Initial State', () => {
    it('should create a valid Room aggregate with default AVAILABLE status and record RoomCreatedEvent', () => {
      const room = Room.create({
        name: 'Hydrotherapy Suite 1',
        capacity: 2,
        features: ['hydrotherapy_tub', 'soundproof'],
      });

      expect(room.id).toBeInstanceOf(RoomId);
      expect(room.name).toBe('Hydrotherapy Suite 1');
      expect(room.resourceType).toBe(ResourceType.ROOM);
      expect(room.capacity).toBe(2);
      expect(room.status).toBe(RoomStatus.AVAILABLE);
      expect(room.version).toBe(1);
      expect(room.isReservable()).toBe(true);
      expect(room.supportsFeatures(['hydrotherapy_tub'])).toBe(true);
      expect(room.supportsFeatures(['sauna'])).toBe(false);
      expect(room.createdAt).toBeInstanceOf(Date);
      expect(room.updatedAt).toBeInstanceOf(Date);

      const events = room.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(RoomCreatedEvent);
      const createdEvent = events[0] as RoomCreatedEvent;
      expect(createdEvent.roomId).toBe(room.id.getValue());
      expect(createdEvent.payload.name).toBe('Hydrotherapy Suite 1');
      expect(createdEvent.payload.capacity).toBe(2);
      expect(createdEvent.payload.features).toEqual(['hydrotherapy_tub', 'soundproof']);
    });

    it('should reject empty or whitespace room names on creation', () => {
      expect(() =>
        Room.create({
          name: '',
          capacity: 1,
        }),
      ).toThrow('Room name cannot be empty.');

      expect(() =>
        Room.create({
          name: '   ',
          capacity: 1,
        }),
      ).toThrow('Room name cannot be empty.');
    });

    it('should enforce positive integer capacity invariant', () => {
      expect(() =>
        Room.create({
          name: 'Invalid Room',
          capacity: 0,
        }),
      ).toThrow('Room capacity must be a positive integer strictly greater than zero.');

      expect(() =>
        Room.create({
          name: 'Invalid Room',
          capacity: -5,
        }),
      ).toThrow('Room capacity must be a positive integer strictly greater than zero.');

      expect(() =>
        Room.create({
          name: 'Invalid Room',
          capacity: 1.5,
        }),
      ).toThrow('Room capacity must be a positive integer strictly greater than zero.');

      expect(() =>
        Room.create({
          name: 'Invalid Room',
          capacity: NaN,
        }),
      ).toThrow('Room capacity must be a positive integer strictly greater than zero.');
    });
  });

  describe('Editing & Mutations', () => {
    it('should rename room, update timestamp, and increment version counter', () => {
      const room = Room.create({ name: 'Room A', capacity: 1 });
      room.clearEvents();
      expect(room.version).toBe(1);

      room.rename('Room A Prime');
      expect(room.name).toBe('Room A Prime');
      expect(room.version).toBe(2);

      expect(() => room.rename('')).toThrow('New room name cannot be empty.');
      expect(() => room.rename('   ')).toThrow('New room name cannot be empty.');
    });

    it('should change room capacity, update timestamp, and increment version counter', () => {
      const room = Room.create({ name: 'Suite 101', capacity: 1 });
      room.clearEvents();

      room.changeCapacity(4);
      expect(room.capacity).toBe(4);
      expect(room.version).toBe(2);

      expect(() => room.changeCapacity(0)).toThrow(
        'Room capacity must be a positive integer strictly greater than zero.',
      );
      expect(() => room.changeCapacity(-1)).toThrow(
        'Room capacity must be a positive integer strictly greater than zero.',
      );
      expect(() => room.changeCapacity(2.5)).toThrow(
        'Room capacity must be a positive integer strictly greater than zero.',
      );
    });

    it('should add and remove features dynamically', () => {
      const room = Room.create({ name: 'Studio 1', capacity: 5 });
      room.clearEvents();

      expect(room.supportsFeatures(['adjustable_table'])).toBe(false);

      room.addFeature('Adjustable_Table');
      expect(room.supportsFeatures(['adjustable_table'])).toBe(true);
      expect(room.version).toBe(2);

      // Adding existing feature is a no-op on version
      room.addFeature('adjustable_table');
      expect(room.version).toBe(2);

      room.removeFeature('adjustable_table');
      expect(room.supportsFeatures(['adjustable_table'])).toBe(false);
      expect(room.version).toBe(3);

      expect(() => room.addFeature('')).toThrow('Feature name cannot be empty.');
    });
  });

  describe('Room Lifecycle & Operational States', () => {
    describe('Deactivation (UNAVAILABLE)', () => {
      it('should deactivate room, update status to UNAVAILABLE, and record RoomDeactivatedEvent', () => {
        const room = Room.create({ name: 'Suite 200', capacity: 2 });
        room.clearEvents();

        room.deactivate('Undergoing structural renovation');

        expect(room.status).toBe(RoomStatus.UNAVAILABLE);
        expect(room.maintenanceReason).toBe('Undergoing structural renovation');
        expect(room.isReservable()).toBe(false);
        expect(room.version).toBe(2);

        const events = room.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(RoomDeactivatedEvent);
        const event = events[0] as RoomDeactivatedEvent;
        expect(event.roomId).toBe(room.id.getValue());
        expect(event.payload.reason).toBe('Undergoing structural renovation');
      });

      it('should handle idempotent deactivation without redundant version increment', () => {
        const room = Room.create({ name: 'Suite 200', capacity: 2 });
        room.deactivate('Reason 1');
        expect(room.version).toBe(2);

        room.deactivate('Reason 1');
        expect(room.version).toBe(2);
      });
    });

    describe('Activation (AVAILABLE)', () => {
      it('should activate an inactive room, clear reasons, and record RoomActivatedEvent', () => {
        const room = Room.create({
          name: 'Suite 300',
          capacity: 1,
          status: RoomStatus.UNAVAILABLE,
        });
        room.clearEvents();

        room.activate();

        expect(room.status).toBe(RoomStatus.AVAILABLE);
        expect(room.maintenanceReason).toBeUndefined();
        expect(room.isReservable()).toBe(true);
        expect(room.version).toBe(2);

        const events = room.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(RoomActivatedEvent);
      });

      it('should handle idempotent activation when already active', () => {
        const room = Room.create({ name: 'Active Room', capacity: 1 });
        expect(room.status).toBe(RoomStatus.AVAILABLE);
        expect(room.version).toBe(1);

        room.activate();
        expect(room.version).toBe(1);
      });
    });

    describe('Maintenance (MAINTENANCE)', () => {
      it('should transition to MAINTENANCE with required reason and emit RoomMarkedMaintenanceEvent', () => {
        const room = Room.create({ name: 'Massage Room 3', capacity: 1 });
        room.clearEvents();

        room.markMaintenance('Plumbing repair');

        expect(room.status).toBe(RoomStatus.MAINTENANCE);
        expect(room.maintenanceReason).toBe('Plumbing repair');
        expect(room.isReservable()).toBe(false);
        expect(room.version).toBe(2);

        const events = room.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(RoomMarkedMaintenanceEvent);
        const event = events[0] as RoomMarkedMaintenanceEvent;
        expect(event.roomId).toBe(room.id.getValue());
        expect(event.payload.reason).toBe('Plumbing repair');
      });

      it('should reject maintenance transition when reason is empty or whitespace', () => {
        const room = Room.create({ name: 'Massage Room 3', capacity: 1 });
        expect(() => room.markMaintenance('')).toThrow('Maintenance reason is required.');
        expect(() => room.markMaintenance('   ')).toThrow('Maintenance reason is required.');
      });
    });
  });

  describe('Interaction with Evaluator & Scheduled Appointments', () => {
    const evaluator = new RoomAvailabilityEvaluator();

    it('should reject new reservations when room is deactivated (UNAVAILABLE), without mutating existing appointments', () => {
      const room = Room.create({ name: 'Consultation Room', capacity: 1 });
      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:00:00Z'),
        new Date('2026-09-01T11:00:00Z'),
      );

      // 1. When AVAILABLE with zero appointments -> Available
      const eval1 = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
      });
      expect(eval1.isAvailable).toBe(true);

      // 2. Simulate existing scheduled appointment for the room
      const existingAppt = Appointment.create({
        clientId: 'client_1',
        therapistId: 'therapist_1',
        roomId: room.id.getValue(),
        type: AppointmentType.create('ASSESSMENT'),
        timeRange: TimeRange.create(
          new Date('2026-09-01T14:00:00Z'),
          new Date('2026-09-01T15:00:00Z'),
        ),
      });

      // 3. Deactivate room for maintenance/closure
      room.deactivate('Building power inspection');
      expect(room.isReservable()).toBe(false);

      // 4. Existing appointment in database remains intact (not deleted/mutated)
      expect(existingAppt.roomId).toBe(room.id.getValue());

      // 5. Subsequent reservation evaluation rejects due to room operational status
      const eval2 = evaluator.evaluate({
        room,
        existingAppointments: [existingAppt],
        targetRange,
      });

      expect(eval2.isAvailable).toBe(false);
      expect(eval2.reason).toContain('is currently UNAVAILABLE: Building power inspection');
    });

    it('should reject when requested capacity exceeds room capacity', () => {
      const room = Room.create({ name: 'Small Room', capacity: 1 });
      const targetRange = TimeRange.create(
        new Date('2026-09-01T10:00:00Z'),
        new Date('2026-09-01T11:00:00Z'),
      );

      const result = evaluator.evaluate({
        room,
        existingAppointments: [],
        targetRange,
        requiredCapacity: 3,
      });

      expect(result.isAvailable).toBe(false);
      expect(result.reason).toContain('capacity (1) is less than required capacity (3)');
    });
  });

  describe('Reconstitution', () => {
    it('should reconstitute existing Room from persistence DTO without recording uncommitted events', () => {
      const roomId = RoomId.create('room_existing_555');
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const room = Room.reconstitute({
        id: roomId,
        version: 12,
        name: 'Executive Suite',
        capacity: 3,
        status: RoomStatus.MAINTENANCE,
        features: ['shower', 'tv'],
        maintenanceReason: 'AC Servicing',
        createdAt,
        updatedAt,
      });

      expect(room.id.getValue()).toBe('room_existing_555');
      expect(room.version).toBe(12);
      expect(room.name).toBe('Executive Suite');
      expect(room.capacity).toBe(3);
      expect(room.status).toBe(RoomStatus.MAINTENANCE);
      expect(room.maintenanceReason).toBe('AC Servicing');
      expect(room.supportsFeatures(['shower', 'tv'])).toBe(true);
      expect(room.createdAt).toBe(createdAt);
      expect(room.updatedAt).toBe(updatedAt);
      expect(room.getUncommittedEvents()).toHaveLength(0);
    });

    it('should reconstitute Room with existing MaintenanceWindows', () => {
      const window = MaintenanceWindow.create({
        id: 'maint_reconst_1',
        timeRange: TimeRange.create(
          new Date('2026-09-01T10:00:00Z'),
          new Date('2026-09-01T12:00:00Z'),
        ),
        reason: 'Filter cleaning',
      });

      const room = Room.reconstitute({
        id: RoomId.create('room_maint_1'),
        version: 5,
        name: 'Hydro Room',
        capacity: 2,
        status: RoomStatus.AVAILABLE,
        features: [],
        maintenanceWindows: [window],
      });

      expect(room.maintenanceWindows).toHaveLength(1);
      expect(room.maintenanceWindows[0]!.id).toBe('maint_reconst_1');
      expect(
        room.isUnderMaintenance(
          TimeRange.create(new Date('2026-09-01T10:30:00Z'), new Date('2026-09-01T11:30:00Z')),
        ),
      ).toBe(true);
      expect(room.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('Scheduled Maintenance Windows Management', () => {
    it('should schedule maintenance window, update version, and record RoomMaintenanceScheduledEvent', () => {
      const room = Room.create({ name: 'Laser Suite', capacity: 1 });
      room.clearEvents();

      const timeRange = TimeRange.create(
        new Date('2026-09-01T08:00:00Z'),
        new Date('2026-09-01T12:00:00Z'),
      );

      const window = room.scheduleMaintenance({
        timeRange,
        reason: 'Laser optical calibration',
      });

      expect(room.maintenanceWindows).toHaveLength(1);
      expect(room.maintenanceWindows[0]!.id).toBe(window.id);

      expect(room.version).toBe(2);

      const events = room.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(RoomMaintenanceScheduledEvent);
      const event = events[0] as RoomMaintenanceScheduledEvent;
      expect(event.roomId).toBe(room.id.getValue());
      expect(event.maintenanceId).toBe(window.id);
      expect(event.payload.reason).toBe('Laser optical calibration');
    });

    it('should cancel maintenance window, update version, and record RoomMaintenanceCancelledEvent', () => {
      const room = Room.create({ name: 'Laser Suite', capacity: 1 });
      const window = room.scheduleMaintenance({
        id: 'maint_cancel_me',
        timeRange: TimeRange.create(
          new Date('2026-09-01T08:00:00Z'),
          new Date('2026-09-01T12:00:00Z'),
        ),
        reason: 'Laser optical calibration',
      });
      room.clearEvents();

      const result = room.cancelMaintenance(window.id);
      expect(result).toBe(true);
      expect(room.maintenanceWindows).toHaveLength(0);
      expect(room.version).toBe(3);

      const events = room.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(RoomMaintenanceCancelledEvent);
      const event = events[0] as RoomMaintenanceCancelledEvent;
      expect(event.roomId).toBe(room.id.getValue());
      expect(event.maintenanceId).toBe('maint_cancel_me');
    });

    it('should return false when cancelling non-existent maintenance window', () => {
      const room = Room.create({ name: 'Laser Suite', capacity: 1 });
      const result = room.cancelMaintenance('non_existent_id');
      expect(result).toBe(false);
    });

    it('should detect when room is under maintenance during window', () => {
      const room = Room.create({ name: 'Laser Suite', capacity: 1 });
      room.scheduleMaintenance({
        timeRange: TimeRange.create(
          new Date('2026-09-01T08:00:00Z'),
          new Date('2026-09-01T12:00:00Z'),
        ),
        reason: 'Laser optical calibration',
      });

      // Target inside window
      expect(
        room.isUnderMaintenance(
          TimeRange.create(new Date('2026-09-01T09:00:00Z'), new Date('2026-09-01T10:00:00Z')),
        ),
      ).toBe(true);

      // Target outside window
      expect(
        room.isUnderMaintenance(
          TimeRange.create(new Date('2026-09-01T14:00:00Z'), new Date('2026-09-01T15:00:00Z')),
        ),
      ).toBe(false);
    });
  });
});
